using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using System.Text;
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
using Microsoft.AspNetCore.Mvc.Rendering;
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
    private static readonly (string TitleKey, string BodyKey)[] ProfileTips =
    {
        ("Dashboard_Profile_Tip_Strategy_Title", "Dashboard_Profile_Tip_Strategy_Body"),
        ("Dashboard_Profile_Tip_Focus_Title", "Dashboard_Profile_Tip_Focus_Body"),
        ("Dashboard_Profile_Tip_Routine_Title", "Dashboard_Profile_Tip_Routine_Body"),
        ("Dashboard_Profile_Tip_Teamplay_Title", "Dashboard_Profile_Tip_Teamplay_Body"),
        ("Dashboard_Profile_Tip_Balance_Title", "Dashboard_Profile_Tip_Balance_Body")
    };

    private readonly record struct RankStage(string Tier, string? Division, int Threshold);
    private static readonly IReadOnlyList<RankStage> RankTable = BuildRankTable();
    private readonly record struct TrophyVisual(string ImagePath, string BaseColor, string HighlightColor);
    private static readonly TrophyVisual DefaultTrophyVisual = new("/img/trophies/silver.png", "#94a3b8", "#e2e8f0");
    private static readonly IReadOnlyDictionary<string, TrophyVisual> TrophyVisuals = BuildTrophyVisuals();

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

    public async Task<IActionResult> Index(string tab = "overview", string? panel = null)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Challenge();
        }

        ViewData["ActiveTab"] = tab;
        if (!string.IsNullOrEmpty(panel))
        {
            ViewData["ProfilePanel"] = panel;
        }

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
            return await ReturnDashboardWithErrorsAsync(user, "profile", "info");
        }

        user.DisplayName = input.DisplayName.Trim();
        user.FirstName = string.IsNullOrWhiteSpace(input.FirstName) ? null : input.FirstName.Trim();
        user.LastName = string.IsNullOrWhiteSpace(input.LastName) ? null : input.LastName.Trim();

        if (input.BirthDate.HasValue)
        {
            var birthDate = input.BirthDate.Value.Date;
            if (birthDate > DateTime.UtcNow.Date)
            {
                ModelState.AddModelError(nameof(input.BirthDate), _localizer["Dashboard_Profile_BirthDate_FutureError"].Value);
                return await ReturnDashboardWithErrorsAsync(user, "profile", "info");
            }

            user.BirthDate = birthDate;
        }
        else
        {
            user.BirthDate = null;
        }

        user.DisplayNameVisibility = input.DisplayNameVisibility;
        user.FirstNameVisibility = input.FirstNameVisibility;
        user.LastNameVisibility = input.LastNameVisibility;
        user.BirthDateVisibility = input.BirthDateVisibility;
        user.EmailVisibility = input.EmailVisibility;

        if (input.Avatar is not null && input.Avatar.Length > 0)
        {
            if (input.Avatar.Length > 2 * 1024 * 1024)
            {
                ModelState.AddModelError(nameof(input.Avatar), "Avatar file is too large (max 2 MB).");
                return await ReturnDashboardWithErrorsAsync(user, "profile", "info");
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

            return await ReturnDashboardWithErrorsAsync(user, "profile", "info");
        }

        await _signInManager.RefreshSignInAsync(user);
        _logger.LogInformation("User {UserId} updated profile settings.", user.Id);
        TempData["DashboardSuccess"] = "ProfileUpdated";
        return RedirectToAction(nameof(Index), new { tab = "profile", panel = "info" });
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
            return await ReturnDashboardWithErrorsAsync(user, "profile", "email");
        }

        var passwordValid = await _users.CheckPasswordAsync(user, input.Password);
        if (!passwordValid)
        {
            ModelState.AddModelError(nameof(input.Password), "Invalid password.");
            return await ReturnDashboardWithErrorsAsync(user, "profile", "email");
        }

        var newEmail = input.Email.Trim();
        var result = await _users.SetEmailAsync(user, newEmail);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "profile", "email");
        }

        user.EmailConfirmed = true;
        var updateResult = await _users.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            foreach (var error in updateResult.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "profile", "email");
        }

        await _signInManager.RefreshSignInAsync(user);
        _logger.LogInformation("User {UserId} updated email address.", user.Id);
        TempData["DashboardSuccess"] = "EmailUpdated";
        return RedirectToAction(nameof(Index), new { tab = "profile", panel = "email" });
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
            return await ReturnDashboardWithErrorsAsync(user, "profile", "password");
        }

        var result = await _users.ChangePasswordAsync(user, input.CurrentPassword, input.NewPassword);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "profile", "password");
        }

        await _signInManager.RefreshSignInAsync(user);
        _logger.LogInformation("User {UserId} changed password.", user.Id);
        TempData["DashboardSuccess"] = "PasswordUpdated";
        return RedirectToAction(nameof(Index), new { tab = "profile", panel = "password" });
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

        var userScoreGroups = await _db.Scores
            .AsNoTracking()
            .Where(s => s.UserId == user.Id)
            .GroupBy(s => s.GameId)
            .Select(g => new
            {
                GameId = g.Key,
                PlayCount = g.Count(),
                BestScore = g.Max(x => x.Value),
                LastPlayedAt = g.Max(x => x.SubmittedAtUtc)
            })
            .ToListAsync();

        if (userScoreGroups.Count > 0)
        {
            var gameIds = userScoreGroups.Select(g => g.GameId).ToArray();

            var gameTitles = await _db.Games
                .AsNoTracking()
                .Where(g => gameIds.Contains(g.Id))
                .Select(g => new { g.Id, g.Title })
                .ToDictionaryAsync(g => g.Id, g => g.Title);

            var bestScores = await _db.Scores
                .AsNoTracking()
                .Where(s => gameIds.Contains(s.GameId))
                .GroupBy(s => new { s.GameId, s.UserId })
                .Select(g => new
                {
                    g.Key.GameId,
                    g.Key.UserId,
                    BestScore = g.Max(x => x.Value)
                })
                .ToListAsync();

            var performances = new List<GamePerformanceStat>(userScoreGroups.Count);

            foreach (var userGame in userScoreGroups)
            {
                var scoreboard = bestScores
                    .Where(bs => bs.GameId == userGame.GameId)
                    .OrderByDescending(bs => bs.BestScore)
                    .ToList();

                var totalPlayers = Math.Max(1, scoreboard.Count);
                var rankPosition = scoreboard.FindIndex(bs => bs.UserId == user.Id) + 1;
                if (rankPosition <= 0)
                {
                    rankPosition = totalPlayers;
                }

                var title = gameTitles.TryGetValue(userGame.GameId, out var name) ? name ?? string.Empty : string.Empty;

                performances.Add(new GamePerformanceStat(
                    userGame.GameId,
                    title,
                    userGame.PlayCount,
                    userGame.BestScore,
                    rankPosition,
                    totalPlayers,
                    userGame.LastPlayedAt));
            }

            if (performances.Count > 0)
            {
                stats.GamePerformances = performances;
                stats.LastScoreSubmittedAt = performances.Max(p => p.LastPlayedAt);
            }
        }

        if (stats.LastScoreSubmittedAt is null && userScoreGroups.Count > 0)
        {
            stats.LastScoreSubmittedAt = userScoreGroups.Max(g => g.LastPlayedAt);
        }

        var rank = CalculateRank(stats);

        var bestGameProjection = await _db.Scores
            .AsNoTracking()
            .Where(s => s.UserId == user.Id)
            .Join(
                _db.Games.AsNoTracking(),
                score => score.GameId,
                game => game.Id,
                (score, game) => new { score.GameId, score.Value, score.SubmittedAtUtc, game.Title })
            .GroupBy(x => new { x.GameId, x.Title })
            .Select(g => new
            {
                g.Key.GameId,
                g.Key.Title,
                AverageScore = g.Average(x => x.Value),
                LastPlayed = g.Max(x => x.SubmittedAtUtc)
            })
            .OrderByDescending(g => g.AverageScore)
            .ThenByDescending(g => g.LastPlayed)
            .FirstOrDefaultAsync();

        ProfileBestGameViewModel? bestGame = null;
        if (bestGameProjection is not null && !string.IsNullOrWhiteSpace(bestGameProjection.Title))
        {
            bestGame = new ProfileBestGameViewModel
            {
                Title = bestGameProjection.Title!,
                AverageScore = bestGameProjection.AverageScore,
                LastPlayedAt = bestGameProjection.LastPlayed
            };
        }

        var visibilityOptions = BuildVisibilityOptions();

        var profile = new ProfileSectionViewModel
        {
            DisplayName = user.DisplayName ?? user.Email ?? user.UserName ?? string.Empty,
            FirstName = user.FirstName,
            LastName = user.LastName,
            BirthDate = user.BirthDate,
            IsBirthdayToday = IsBirthdayToday(user.BirthDate),
            AvatarUrl = user.AvatarUrl,
            Email = user.Email ?? string.Empty,
            DisplayNameVisibility = user.DisplayNameVisibility,
            FirstNameVisibility = user.FirstNameVisibility,
            LastNameVisibility = user.LastNameVisibility,
            BirthDateVisibility = user.BirthDateVisibility,
            EmailVisibility = user.EmailVisibility,
            Rank = rank,
            BestGame = bestGame,
            Highlights = BuildHighlights(user, rank, bestGame),
            VisibilityOptions = visibilityOptions
        };

        return new DashboardViewModel
        {
            Games = games,
            MyGames = myGames,

            Profile = profile,
            Security = new SecuritySectionViewModel
            {
                Email = user.Email ?? string.Empty
            },
            Stats = stats,
            NewGame = new CreateGameFormViewModel(),
            Friends = friendVms
        };
    }

    private async Task<IActionResult> ReturnDashboardWithErrorsAsync(ApplicationUser user, string tab, string? profilePanel = null)
    {
        ViewData["ActiveTab"] = tab;
        if (!string.IsNullOrEmpty(profilePanel))
        {
            ViewData["ProfilePanel"] = profilePanel;
        }
        var vm = await BuildViewModelAsync(user);

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.DisplayName), out var displayNameState) &&
            !string.IsNullOrWhiteSpace(displayNameState.AttemptedValue))
        {
            vm.Profile.DisplayName = displayNameState.AttemptedValue!;
        }

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.FirstName), out var firstNameState))
        {
            vm.Profile.FirstName = firstNameState.AttemptedValue;
        }

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.LastName), out var lastNameState))
        {
            vm.Profile.LastName = lastNameState.AttemptedValue;
        }

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.BirthDate), out var birthDateState) &&
            DateTime.TryParse(birthDateState.AttemptedValue, CultureInfo.CurrentCulture, DateTimeStyles.AssumeUniversal, out var parsedBirthDate))
        {
            vm.Profile.BirthDate = parsedBirthDate.Date;
        }

        vm.Profile.DisplayNameVisibility = GetVisibilityFromState(nameof(UpdateProfileInputModel.DisplayNameVisibility));
        vm.Profile.FirstNameVisibility = GetVisibilityFromState(nameof(UpdateProfileInputModel.FirstNameVisibility));
        vm.Profile.LastNameVisibility = GetVisibilityFromState(nameof(UpdateProfileInputModel.LastNameVisibility));
        vm.Profile.BirthDateVisibility = GetVisibilityFromState(nameof(UpdateProfileInputModel.BirthDateVisibility));
        vm.Profile.EmailVisibility = GetVisibilityFromState(nameof(UpdateProfileInputModel.EmailVisibility));


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

        ProfileVisibility GetVisibilityFromState(string key)
        {
            if (ModelState.TryGetValue(key, out var state) && int.TryParse(state.AttemptedValue, out var raw) && Enum.IsDefined(typeof(ProfileVisibility), raw))
            {
                return (ProfileVisibility)raw;
            }

            return key switch
            {
                nameof(UpdateProfileInputModel.DisplayNameVisibility) => vm.Profile.DisplayNameVisibility,
                nameof(UpdateProfileInputModel.FirstNameVisibility) => vm.Profile.FirstNameVisibility,
                nameof(UpdateProfileInputModel.LastNameVisibility) => vm.Profile.LastNameVisibility,
                nameof(UpdateProfileInputModel.BirthDateVisibility) => vm.Profile.BirthDateVisibility,
                nameof(UpdateProfileInputModel.EmailVisibility) => vm.Profile.EmailVisibility,
                _ => ProfileVisibility.OwnerOnly
            };
        }
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

    private static IReadOnlyList<RankStage> BuildRankTable()
    {
        var stages = new List<RankStage>();
        var xp = 0;

        void AddTier(string tier, int step, params string[] divisions)
        {
            if (divisions.Length == 0)
            {
                stages.Add(new RankStage(tier, null, xp));
                xp += step;
                return;
            }

            foreach (var division in divisions)
            {
                stages.Add(new RankStage(tier, division, xp));
                xp += step;
            }
        }

        AddTier("Drewno", 90, "IV", "III", "II", "I");
        AddTier("Brąz", 130, "IV", "III", "II", "I");
        AddTier("Srebro", 170, "IV", "III", "II", "I");
        AddTier("Złoto", 220, "IV", "III", "II", "I");
        AddTier("Platyna", 270, "IV", "III", "II", "I");
        AddTier("Szmaragd", 330, "IV", "III", "II", "I");
        AddTier("Diament", 400, "IV", "III", "II", "I");
        AddTier("Mistrz", 520);
        AddTier("Arcymistrz", 650);
        AddTier("Pretendent", 0);

        return stages;
    }

    private static ProfileRankViewModel PopulateRankVisuals(ProfileRankViewModel rank)
    {
        var current = ResolveTrophyVisual(rank.Tier);
        rank.AccentColor = current.BaseColor;
        rank.AccentHighlightColor = current.HighlightColor;
        rank.AccentGlowColor = HexToRgba(current.HighlightColor, 0.45d);
        rank.TrophyImage = current.ImagePath;

        if (!string.IsNullOrWhiteSpace(rank.NextTier))
        {
            var next = ResolveTrophyVisual(rank.NextTier);
            rank.NextAccentColor = next.BaseColor;
            rank.NextAccentHighlightColor = next.HighlightColor;
            rank.NextAccentGlowColor = HexToRgba(next.HighlightColor, 0.45d);
            rank.NextTrophyImage = next.ImagePath;
        }
        else
        {
            rank.NextTrophyImage = null;
            rank.NextAccentColor = null;
            rank.NextAccentHighlightColor = null;
            rank.NextAccentGlowColor = null;
        }

        return rank;
    }

    private static TrophyVisual ResolveTrophyVisual(string? tier)
    {
        if (string.IsNullOrWhiteSpace(tier))
        {
            return DefaultTrophyVisual;
        }

        var key = NormalizeTierKey(tier);
        return TrophyVisuals.TryGetValue(key, out var visual) ? visual : DefaultTrophyVisual;
    }

    private static IReadOnlyDictionary<string, TrophyVisual> BuildTrophyVisuals()
    {
        var visuals = new Dictionary<string, TrophyVisual>
        {
            ["drewno"] = new("/img/trophies/wood.png", "#b45309", "#f59e0b"),
            ["braz"] = new("/img/trophies/bronze.png", "#cd7f32", "#f97316"),
            ["srebro"] = new("/img/trophies/silver.png", "#94a3b8", "#e2e8f0"),
            ["zloto"] = new("/img/trophies/gold.png", "#f59e0b", "#fde68a"),
            ["platyna"] = new("/img/trophies/platinum.png", "#38bdf8", "#5eead4"),
            ["szmaragd"] = new("/img/trophies/emerald.png", "#10b981", "#34d399"),
            ["diament"] = new("/img/trophies/diamond.png", "#60a5fa", "#a855f7"),
            ["mistrz"] = new("/img/trophies/master.png", "#a855f7", "#f472b6"),
            ["arcymistrz"] = new("/img/trophies/grandmaster.png", "#f97316", "#fb7185"),
            ["pretendent"] = new("/img/trophies/challenger.png", "#facc15", "#fbbf24")
        };

        visuals["wood"] = visuals["drewno"];
        visuals["zelazo"] = visuals["drewno"];
        visuals["iron"] = visuals["drewno"];
        visuals["bronze"] = visuals["braz"];
        visuals["silver"] = visuals["srebro"];
        visuals["gold"] = visuals["zloto"];
        visuals["platinum"] = visuals["platyna"];
        visuals["emerald"] = visuals["szmaragd"];
        visuals["diamond"] = visuals["diament"];
        visuals["master"] = visuals["mistrz"];
        visuals["grandmaster"] = visuals["arcymistrz"];
        visuals["challenger"] = visuals["pretendent"];

        return visuals;
    }

    private static string NormalizeTierKey(string value)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var ch in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(ch);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (!char.IsWhiteSpace(ch))
            {
                builder.Append(char.ToLowerInvariant(ch));
            }
        }

        return builder.ToString();
    }

    private static string HexToRgba(string hex, double alpha)
    {
        if (string.IsNullOrWhiteSpace(hex))
        {
            return $"rgba(148, 163, 184, {alpha.ToString(CultureInfo.InvariantCulture)})";
        }

        var sanitized = hex.TrimStart('#');
        if (sanitized.Length == 3)
        {
            sanitized = string.Concat(sanitized.Select(c => new string(c, 2)));
        }

        if (sanitized.Length != 6)
        {
            return $"rgba(148, 163, 184, {alpha.ToString(CultureInfo.InvariantCulture)})";
        }

        var r = int.Parse(sanitized[..2], NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        var g = int.Parse(sanitized.Substring(2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        var b = int.Parse(sanitized.Substring(4, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);

        return $"rgba({r}, {g}, {b}, {alpha.ToString(CultureInfo.InvariantCulture)})";
    }

    private static int CalculateTotalExperience(DashboardStatsViewModel stats)
    {
        var xpFromGames = 0d;

        foreach (var game in stats.GamePerformances)
        {
            var participants = Math.Max(1, game.TotalPlayers);
            var percentile = participants == 1
                ? 1d
                : 1d - (game.RankPosition - 1d) / participants;

            var volumeBoost = Math.Clamp(Math.Log10(game.TotalMatches + 1d) + 0.2d, 0.55d, 1.6d);
            var skillMultiplier = 0.55d + percentile * 0.45d;

            xpFromGames += 85d * skillMultiplier * volumeBoost;
        }

        var engagementXp = stats.UploadedGames * 140 + stats.TotalReviews * 30 + stats.FriendsCount * 15;
        var activityXp = Math.Min(stats.TotalScores * 6, 360);

        var totalXp = xpFromGames + engagementXp + activityXp;

        if (stats.LastScoreSubmittedAt is DateTime lastPlayed)
        {
            var inactivityDays = (DateTime.UtcNow - lastPlayed).TotalDays;
            if (inactivityDays > 5)
            {
                var penalty = Math.Min(totalXp * 0.4d, ((inactivityDays - 5d) / 4d) * 60d);
                totalXp -= penalty;
            }
        }
        else if (totalXp > 0)
        {
            totalXp *= 0.6d;
        }

        if (stats.GamePerformances.Count == 0)
        {
            totalXp -= 120d;
        }

        totalXp = Math.Max(0d, totalXp);

        return (int)Math.Round(totalXp);
    }

    private static ProfileRankViewModel CalculateRank(DashboardStatsViewModel stats)
    {
        var xp = CalculateTotalExperience(stats);

        var currentStage = RankTable[0];
        RankStage? nextStage = null;

        foreach (var stage in RankTable)
        {
            if (xp >= stage.Threshold)
            {
                currentStage = stage;
            }
            else
            {
                nextStage = stage;
                break;
            }
        }

        var nextThreshold = nextStage?.Threshold ?? (currentStage.Threshold + 500);
        var xpIntoCurrent = Math.Max(0, xp - currentStage.Threshold);
        var window = Math.Max(1, nextThreshold - currentStage.Threshold);
        var xpToNext = nextStage is null ? 0 : Math.Max(0, nextThreshold - xp);
        var progress = nextStage is null ? 100 : Math.Clamp((int)Math.Round((double)xpIntoCurrent / window * 100), 0, 100);

        var rank = new ProfileRankViewModel
        {
            Tier = currentStage.Tier,
            Division = currentStage.Division,
            NextTier = nextStage?.Tier,
            NextDivision = nextStage?.Division,
            ExperiencePoints = xp,
            CurrentThreshold = currentStage.Threshold,
            NextThreshold = nextThreshold,
            XpIntoCurrent = xpIntoCurrent,
            XpRequiredForNext = xpToNext,
            ProgressPercent = progress
        };
        return PopulateRankVisuals(rank);
    }

    private static bool IsBirthdayToday(DateTime? birthDate)
    {
        if (birthDate is null)
        {
            return false;
        }

        var today = DateTime.UtcNow;
        return birthDate.Value.Month == today.Month && birthDate.Value.Day == today.Day;
    }

    private IReadOnlyList<SelectListItem> BuildVisibilityOptions()
    {
        return new List<SelectListItem>
        {
            new SelectListItem
            {
                Value = ((int)ProfileVisibility.Everyone).ToString(CultureInfo.InvariantCulture),
                Text = _localizer["Dashboard_Profile_Visibility_Everyone"].Value
            },
            new SelectListItem
            {
                Value = ((int)ProfileVisibility.Friends).ToString(CultureInfo.InvariantCulture),
                Text = _localizer["Dashboard_Profile_Visibility_Friends"].Value
            },
            new SelectListItem
            {
                Value = ((int)ProfileVisibility.OwnerOnly).ToString(CultureInfo.InvariantCulture),
                Text = _localizer["Dashboard_Profile_Visibility_Owner"].Value
            }
        };

    }

    private IReadOnlyList<ProfileHighlightViewModel> BuildHighlights(ApplicationUser user, ProfileRankViewModel rank, ProfileBestGameViewModel? bestGame)
    {
        var highlights = new List<ProfileHighlightViewModel>();

        if (IsBirthdayToday(user.BirthDate))
        {
            highlights.Add(new ProfileHighlightViewModel(
                _localizer["Dashboard_Profile_Highlight_Birthday_Title"].Value,
                string.Format(_localizer["Dashboard_Profile_Highlight_Birthday_Body"].Value, user.DisplayName ?? user.Email ?? user.UserName ?? _localizer["Dashboard_Profile_Highlight_Birthday_Default"].Value)));
        }

        if (rank.NextDisplayName is not null && rank.XpRequiredForNext > 0)
        {
            highlights.Add(new ProfileHighlightViewModel(
                _localizer["Dashboard_Profile_Highlight_NextRank_Title"].Value,
                string.Format(_localizer["Dashboard_Profile_Highlight_NextRank_Body"].Value, rank.NextDisplayName, rank.XpRequiredForNext)));
        }
        else
        {
            highlights.Add(new ProfileHighlightViewModel(
                _localizer["Dashboard_Profile_Highlight_MaxRank_Title"].Value,
                _localizer["Dashboard_Profile_Highlight_MaxRank_Body"].Value));
        }

        if (bestGame is not null)
        {
            highlights.Add(new ProfileHighlightViewModel(
                _localizer["Dashboard_Profile_Highlight_BestGame_Title"].Value,
                string.Format(_localizer["Dashboard_Profile_Highlight_BestGame_Body"].Value, bestGame.Title, bestGame.AverageScore.ToString("0.##", CultureInfo.CurrentCulture))));
        }
        else
        {
            highlights.Add(new ProfileHighlightViewModel(
                _localizer["Dashboard_Profile_Highlight_NoBestGame_Title"].Value,
                _localizer["Dashboard_Profile_Highlight_NoBestGame_Body"].Value));
        }

        var tipIndex = GetTipIndex(user.Id);
        var tip = ProfileTips[tipIndex];
        highlights.Add(new ProfileHighlightViewModel(
            _localizer[tip.TitleKey].Value,
            _localizer[tip.BodyKey].Value));

        return highlights;
    }

    private static int GetTipIndex(string? userId)
    {
        var seed = DateTime.UtcNow.DayOfYear;
        if (!string.IsNullOrEmpty(userId))
        {
            foreach (var ch in userId)
            {
                seed = unchecked(seed * 31 + ch);
            }
        }

            if (ProfileTips.Length == 0)
            {
                return 0;
            }

            return Math.Abs(seed) % ProfileTips.Length;
        }
    }
