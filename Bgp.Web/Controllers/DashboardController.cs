using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Models;
using Bgp.Web.Resources;
using System.IO.Compression;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.Controllers;

[Authorize]
public class DashboardController : Controller
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<DashboardController> _logger;
    private readonly IStringLocalizer<SharedResource> _localizer;

    private static readonly Regex SlugRegex = new("[^a-z0-9-]", RegexOptions.Compiled);
    private static readonly Regex VersionSanitizer = new("[^a-zA-Z0-9._-]", RegexOptions.Compiled);

    public DashboardController(
        UserManager<ApplicationUser> users,
        SignInManager<ApplicationUser> signInManager,
        AppDbContext db,
        IWebHostEnvironment env,
        ILogger<DashboardController> logger,
        IStringLocalizer<SharedResource> localizer)
    {
        _users = users;
        _signInManager = signInManager;
        _db = db;
        _env = env;
        _logger = logger;
        _localizer = localizer;
    }

    public async Task<IActionResult> Index(string tab = "overview")
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Challenge();
        }

        ViewData["ActiveTab"] = tab;
        var vm = await BuildViewModelAsync(user);
        return View(vm);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateProfile(UpdateProfileInputModel input)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Challenge();
        }

        if (!ModelState.IsValid)
        {
            return await ReturnDashboardWithErrorsAsync(user, "profile");
        }

        user.DisplayName = input.DisplayName.Trim();

        if (input.Avatar is not null && input.Avatar.Length > 0)
        {
            if (input.Avatar.Length > 2 * 1024 * 1024)
            {
                ModelState.AddModelError(nameof(input.Avatar), "Avatar file is too large (max 2 MB).");
                return await ReturnDashboardWithErrorsAsync(user, "profile");
            }

            var uploadsDir = Path.Combine(_env.WebRootPath, "uploads", "avatars");
            Directory.CreateDirectory(uploadsDir);

            var extension = Path.GetExtension(input.Avatar.FileName);
            if (string.IsNullOrWhiteSpace(extension) || extension.Length > 8)
            {
                extension = ".png";
            }

            var fileName = $"{user.Id}{extension}";
            var filePath = Path.Combine(uploadsDir, fileName);

            await using var fs = System.IO.File.Create(filePath);
            await input.Avatar.CopyToAsync(fs);

            user.AvatarUrl = $"/uploads/avatars/{fileName}";
        }

        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "profile");
        }

        await _signInManager.RefreshSignInAsync(user);
        _logger.LogInformation("User {UserId} updated profile settings.", user.Id);
        TempData["DashboardSuccess"] = "ProfileUpdated";
        return RedirectToAction(nameof(Index), new { tab = "profile" });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateEmail(UpdateEmailInputModel input)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Challenge();
        }

        if (!ModelState.IsValid)
        {
            return await ReturnDashboardWithErrorsAsync(user, "security");
        }

        var passwordValid = await _users.CheckPasswordAsync(user, input.Password);
        if (!passwordValid)
        {
            ModelState.AddModelError(nameof(input.Password), "Invalid password.");
            return await ReturnDashboardWithErrorsAsync(user, "security");
        }

        var newEmail = input.Email.Trim();
        var result = await _users.SetEmailAsync(user, newEmail);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "security");
        }

        user.EmailConfirmed = true;
        var updateResult = await _users.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            foreach (var error in updateResult.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "security");
        }

        await _signInManager.RefreshSignInAsync(user);
        _logger.LogInformation("User {UserId} updated email address.", user.Id);
        TempData["DashboardSuccess"] = "EmailUpdated";
        return RedirectToAction(nameof(Index), new { tab = "security" });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ChangePassword(ChangePasswordInputModel input)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Challenge();
        }

        if (!ModelState.IsValid)
        {
            return await ReturnDashboardWithErrorsAsync(user, "security");
        }

        var result = await _users.ChangePasswordAsync(user, input.CurrentPassword, input.NewPassword);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "security");
        }

        await _signInManager.RefreshSignInAsync(user);
        _logger.LogInformation("User {UserId} changed password.", user.Id);
        TempData["DashboardSuccess"] = "PasswordUpdated";
        return RedirectToAction(nameof(Index), new { tab = "security" });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> CreateGame(CreateGameFormViewModel input)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Challenge();
        }

        if (!ModelState.IsValid)
        {
            return await ReturnDashboardWithErrorsAsync(user, "games");
        }

        var slug = await GenerateUniqueSlugAsync(input.Title);
        string? coverPath = null;
        var version = string.IsNullOrWhiteSpace(input.Version) ? "1.0.0" : input.Version.Trim();
        version = VersionSanitizer.Replace(version, "-");
        if (string.IsNullOrWhiteSpace(version))
        {
            ModelState.AddModelError(nameof(input.Version), "Invalid version name.");
            return await ReturnDashboardWithErrorsAsync(user, "games");
        }

        if (input.CoverImage is not null && input.CoverImage.Length > 0)
        {
            if (input.CoverImage.Length > 5 * 1024 * 1024)
            {
                ModelState.AddModelError(nameof(input.CoverImage), "Cover image is too large (max 5 MB).");
                return await ReturnDashboardWithErrorsAsync(user, "games");
            }

            var coversDir = Path.Combine(_env.WebRootPath, "uploads", "covers");
            Directory.CreateDirectory(coversDir);

            var extension = Path.GetExtension(input.CoverImage.FileName);
            if (string.IsNullOrWhiteSpace(extension) || extension.Length > 8)
            {
                extension = ".png";
            }

            var fileName = $"{slug}{extension}";
            var filePath = Path.Combine(coversDir, fileName);

            await using var fs = System.IO.File.Create(filePath);
            await input.CoverImage.CopyToAsync(fs);

            coverPath = $"/uploads/covers/{fileName}";
        }

        if (input.Package is null || input.Package.Length == 0)
        {
            ModelState.AddModelError(nameof(input.Package), "Package is required.");
            return await ReturnDashboardWithErrorsAsync(user, "games");
        }

        var packageExt = Path.GetExtension(input.Package.FileName).ToLowerInvariant();
        if (packageExt != ".zip")
        {
            ModelState.AddModelError(nameof(input.Package), "Expected .zip archive exported from Unity WebGL build.");
            return await ReturnDashboardWithErrorsAsync(user, "games");
        }

        var targetRoot = Path.Combine(_env.WebRootPath, "games", slug, version);
        if (Directory.Exists(targetRoot))
        {
            Directory.Delete(targetRoot, recursive: true);
        }
        Directory.CreateDirectory(targetRoot);

        try
        {
            await using var packageStream = input.Package.OpenReadStream();
            using var archive = new ZipArchive(packageStream, ZipArchiveMode.Read, leaveOpen: false);

            foreach (var entry in archive.Entries)
            {
                var destinationPath = Path.Combine(targetRoot, entry.FullName);
                var normalizedPath = Path.GetFullPath(destinationPath);
                if (!normalizedPath.StartsWith(targetRoot, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("Invalid path in archive.");
                }

                if (string.IsNullOrEmpty(entry.Name))
                {
                    Directory.CreateDirectory(normalizedPath);
                    continue;
                }

                Directory.CreateDirectory(Path.GetDirectoryName(normalizedPath)!);
                await using var entryStream = entry.Open();
                await using var fileStream = System.IO.File.Create(normalizedPath);
                await entryStream.CopyToAsync(fileStream);
            }
        }
        catch (InvalidDataException)
        {
            ModelState.AddModelError(nameof(input.Package), "Uploaded archive is invalid or corrupted.");
            if (Directory.Exists(targetRoot))
            {
                Directory.Delete(targetRoot, true);
            }
            return await ReturnDashboardWithErrorsAsync(user, "games");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to extract package for user {UserId}", user.Id);
            ModelState.AddModelError(nameof(input.Package), "Failed to extract uploaded package.");
            if (Directory.Exists(targetRoot))
            {
                Directory.Delete(targetRoot, true);
            }
            return await ReturnDashboardWithErrorsAsync(user, "games");
        }

        var game = new Game
        {
            Title = input.Title.Trim(),
            Slug = slug,
            Description = input.Description?.Trim(),
            CoverImagePath = coverPath,
            CreatedByUserId = user.Id,
            ApprovalStatus = GameApprovalStatus.Pending,
            Modes = GameMode.Singleplayer
        };

        var versionEntity = new GameVersion
        {
            Game = game,
            Version = version,
            ContentPath = $"/games/{slug}/{version}",
            PublishedAtUtc = DateTime.UtcNow
        };

        await _db.Games.AddAsync(game);
        await _db.GameVersions.AddAsync(versionEntity);
        await _db.SaveChangesAsync();

        _logger.LogInformation("User {UserId} created a new game {GameId}.", user.Id, game.Id);
        TempData["DashboardSuccess"] = "GameCreated";
        return RedirectToAction(nameof(Index), new { tab = "games" });
    }

    private async Task<DashboardViewModel> BuildViewModelAsync(ApplicationUser user)
    {
        var games = await _db.Games
            .AsNoTracking()
            .Where(g => g.ApprovalStatus == GameApprovalStatus.Approved)
            .OrderByDescending(g => g.CreatedAtUtc)
            .Select(g => new GameSummaryViewModel(
                g.Id,
                g.Title,
                g.Slug,
                g.CoverImagePath,
                g.Reviews.Any() ? g.Reviews.Average(r => r.Stars) : 0.0,
                g.ApprovalStatus,
                g.CreatedAtUtc,
                g.ModerationNotes))
            .ToListAsync();

        var myGames = await _db.Games
            .AsNoTracking()
            .Where(g => g.CreatedByUserId == user.Id)
            .OrderByDescending(g => g.CreatedAtUtc)
            .Select(g => new GameSummaryViewModel(
                g.Id,
                g.Title,
                g.Slug,
                g.CoverImagePath,
                g.Reviews.Any() ? g.Reviews.Average(r => r.Stars) : 0.0,
                g.ApprovalStatus,
                g.CreatedAtUtc,
                g.ModerationNotes))
            .ToListAsync();

        var friends = await _db.Friendships
            .AsNoTracking()
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == user.Id || f.AddresseeId == user.Id))
            .Select(f => new
            {
                FriendId = f.RequesterId == user.Id ? f.AddresseeId : f.RequesterId,
                f.CreatedAtUtc
            })
            .ToListAsync();

        var friendIds = friends.Select(f => f.FriendId).ToList();

        var friendProfiles = await _db.Users
            .AsNoTracking()
            .Where(u => friendIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl })
            .ToListAsync();

        var friendLookup = friendProfiles.ToDictionary(f => f.Id, f => f);

        var unknownFriend = _localizer["Dashboard_Friends_Unknown"].Value;

        var friendVms = friends
            .Select(f =>
            {
                friendLookup.TryGetValue(f.FriendId, out var profile);
                return new FriendViewModel
                {
                    DisplayName = profile?.DisplayName ?? unknownFriend,
                    AvatarUrl = profile?.AvatarUrl,
                    Since = f.CreatedAtUtc
                };
            })
            .OrderBy(f => f.DisplayName)
            .ToList();

        var stats = new DashboardStatsViewModel
        {
            UploadedGames = await _db.Games.CountAsync(g => g.CreatedByUserId == user.Id),
            TotalScores = await _db.Scores.CountAsync(s => s.UserId == user.Id),
            TotalReviews = await _db.GameReviews.CountAsync(r => r.UserId == user.Id),
            FriendsCount = friendVms.Count
        };


        var rank = CalculateRank(stats);

        return new DashboardViewModel
        {
            Games = games,
            MyGames = myGames,
            Profile = new ProfileSectionViewModel
            {
                DisplayName = user.DisplayName ?? user.Email ?? user.UserName ?? string.Empty,
                AvatarUrl = user.AvatarUrl,
                Email = user.Email ?? string.Empty,
                RankName = rank.Name,
                RankLevel = rank.Level,
                ExperiencePoints = rank.Xp,
                ExperienceToNextLevel = rank.XpToNextLevel,
                CurrentLevelThreshold = rank.CurrentThreshold
            },
            Security = new SecuritySectionViewModel
            {
                Email = user.Email ?? string.Empty
            },
            Stats = stats,
            NewGame = new CreateGameFormViewModel(),
            Friends = friendVms
        };
    }

    private async Task<IActionResult> ReturnDashboardWithErrorsAsync(ApplicationUser user, string tab)
    {
        ViewData["ActiveTab"] = tab;
        var vm = await BuildViewModelAsync(user);

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.DisplayName), out var displayNameState) &&
            !string.IsNullOrWhiteSpace(displayNameState.AttemptedValue))
        {
            vm.Profile.DisplayName = displayNameState.AttemptedValue!;
        }

        if (ModelState.TryGetValue(nameof(UpdateEmailInputModel.Email), out var emailState) &&
            !string.IsNullOrWhiteSpace(emailState.AttemptedValue))
        {
            vm.Security.Email = emailState.AttemptedValue!;
        }

        if (ModelState.TryGetValue(nameof(CreateGameFormViewModel.Title), out var titleState) &&
            !string.IsNullOrWhiteSpace(titleState.AttemptedValue))
        {
            vm.NewGame.Title = titleState.AttemptedValue!;
        }

        if (ModelState.TryGetValue(nameof(CreateGameFormViewModel.Description), out var descriptionState))
        {
            vm.NewGame.Description = descriptionState.AttemptedValue;
        }

        if (ModelState.TryGetValue(nameof(CreateGameFormViewModel.Version), out var versionState) &&
            !string.IsNullOrWhiteSpace(versionState.AttemptedValue))
        {
            vm.NewGame.Version = versionState.AttemptedValue!;
        }

        return View("Index", vm);
    }

    private async Task<string> GenerateUniqueSlugAsync(string title)
    {
        var baseSlug = Slugify(title);
        var slug = baseSlug;
        var counter = 1;

        while (await _db.Games.AnyAsync(g => g.Slug == slug))
        {
            counter++;
            slug = $"{baseSlug}-{counter}";
        }

        return slug;
    }

    private static string Slugify(string value)
    {
        var slug = value.ToLowerInvariant();
        slug = slug.Replace(' ', '-');
        slug = SlugRegex.Replace(slug, string.Empty);
        slug = Regex.Replace(slug, "-+", "-");
        slug = slug.Trim('-');
        return string.IsNullOrWhiteSpace(slug) ? Guid.NewGuid().ToString("n") : slug;
    }

    private static (string Name, int Level, int Xp, int XpToNextLevel, int CurrentThreshold) CalculateRank(DashboardStatsViewModel stats)
    {
        var xp = stats.UploadedGames * 120 + stats.TotalScores * 30 + stats.TotalReviews * 45 + stats.FriendsCount * 25;

        var thresholds = new (int Threshold, string Name)[]
        {
            (0, "Nowicjusz"),
            (250, "Entuzjasta"),
            (600, "Weteran"),
            (1200, "Arcymistrz")
        };

        var current = thresholds[0];
        int? next = null;
        for (var i = 0; i < thresholds.Length; i++)
        {
            if (xp >= thresholds[i].Threshold)
            {
                current = thresholds[i];
                next = i + 1 < thresholds.Length ? thresholds[i + 1].Threshold : null;
            }
        }

        var level = Array.IndexOf(thresholds, current) + 1;
        var xpToNext = next.HasValue ? Math.Max(0, next.Value - xp) : 0;

        return (current.Name, level, xp, xpToNext, current.Threshold);
    }
}