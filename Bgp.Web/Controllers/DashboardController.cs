using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Models;
using Bgp.Web.Resources;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using Bgp.Web.Helpers;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

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

    private const long MaxAvatarBytes = 2 * 1024 * 1024;
    private const int AvatarTargetSize = 256;

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

        var sanitizedDisplayName = DisplayNameFormatter.Format(input.DisplayName.Trim());
        var displayNameRequested = false;
        var hasDisplayNameChange = !string.Equals(
            sanitizedDisplayName,
            user.DisplayName,
            StringComparison.OrdinalIgnoreCase);

        if (hasDisplayNameChange)
        {
            if (!string.IsNullOrWhiteSpace(user.PendingDisplayName))
            {
                ModelState.AddModelError(nameof(input.DisplayName), Localize("Dashboard_Profile_DisplayName_Pending"));
                return await ReturnDashboardWithErrorsAsync(user, "profile", "info");
            }

            var lastApproved = user.DisplayNameLastApprovedAtUtc ?? user.CreatedAtUtc;
            if (lastApproved > DateTime.UtcNow.AddMonths(-1))
            {
                ModelState.AddModelError(nameof(input.DisplayName), Localize("Dashboard_Profile_DisplayName_Cooldown"));
                return await ReturnDashboardWithErrorsAsync(user, "profile", "info");
            }

            user.PendingDisplayName = sanitizedDisplayName;
            user.PendingDisplayNameRequestedAtUtc = DateTime.UtcNow;
            displayNameRequested = true;
        }

        if (input.BirthMonth.HasValue || input.BirthDay.HasValue)
        {
            if (!(input.BirthMonth.HasValue && input.BirthDay.HasValue))
            {
                ModelState.AddModelError(nameof(input.BirthDay), Localize("Dashboard_Profile_BirthDate_Incomplete"));
                return await ReturnDashboardWithErrorsAsync(user, "profile", "info");
            }

            var month = input.BirthMonth!.Value;
            var day = input.BirthDay!.Value;

            if (!IsValidDayMonthCombination(month, day))
            {
                ModelState.AddModelError(nameof(input.BirthDay), Localize("Dashboard_Profile_BirthDate_Invalid"));
                return await ReturnDashboardWithErrorsAsync(user, "profile", "info");
            }

            user.BirthMonth = month;
            user.BirthDay = day;
        }
        else
        {
            user.BirthMonth = null;
            user.BirthDay = null;
        }

        user.DisplayNameVisibility = input.DisplayNameVisibility;
        user.BirthDateVisibility = input.BirthDateVisibility;
        user.EmailVisibility = input.EmailVisibility;

        if (input.Avatar is not null && input.Avatar.Length > 0)
        {
            

            var uploadsDir = Path.Combine(_env.WebRootPath, "uploads", "avatars");
            Directory.CreateDirectory(uploadsDir);

            var fileName = $"{user.Id}.jpg";
            var filePath = Path.Combine(uploadsDir, fileName);

            var processed = await TryProcessAndSaveAvatarAsync(input.Avatar, filePath);
            if (!processed)
            {
                ModelState.AddModelError(nameof(input.Avatar), Localize("Dashboard_Profile_Avatar_ProcessingError"));
                return await ReturnDashboardWithErrorsAsync(user, "profile", "info");
            }

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
        TempData["DashboardSuccess"] = displayNameRequested ? "DisplayNameRequested" : "ProfileUpdated";
        return RedirectToAction(nameof(Index), new { tab = "profile", panel = "info" });
    }

    private async Task<bool> TryProcessAndSaveAvatarAsync(IFormFile avatar, string filePath)
    {
        try
        {
            await using var sourceStream = avatar.OpenReadStream();
            using var image = await Image.LoadAsync<Rgba32>(sourceStream);

            image.Mutate(x =>
            {
                x.AutoOrient();
                var minSide = Math.Min(image.Width, image.Height);
                var cropRect = new Rectangle(
                    (image.Width - minSide) / 2,
                    (image.Height - minSide) / 2,
                    minSide,
                    minSide);
                x.Crop(cropRect);
                x.Resize(new ResizeOptions
                {
                    Size = new Size(AvatarTargetSize, AvatarTargetSize),
                    Mode = ResizeMode.Crop,
                    Sampler = KnownResamplers.Lanczos3
                });
            });

            foreach (var quality in new[] { 90, 80, 70, 60, 50 })
            {
                await using var outputStream = new MemoryStream();
                var encoder = new JpegEncoder { Quality = quality };
                await image.SaveAsync(outputStream, encoder);

                if (outputStream.Length <= MaxAvatarBytes)
                {
                    outputStream.Position = 0;
                    await using var destinationStream = System.IO.File.Create(filePath);
                    await outputStream.CopyToAsync(destinationStream);
                    return true;
                }

                
            }

            _logger.LogWarning(
                "Failed to compress avatar image below the maximum size constraint after trying all quality levels.");
            return false;
        }
        catch (UnknownImageFormatException ex)
        {
            _logger.LogWarning(ex, "Unsupported avatar image format uploaded.");
            return false;
        }
        catch (InvalidImageContentException ex)
        {
            _logger.LogWarning(ex, "Invalid avatar image content uploaded.");
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while processing avatar image.");
            return false;
        }
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

        var proposedCategories = GameCategory.None;
        foreach (var categoryValue in input.SelectedCategoryValues)
        {
            if (int.TryParse(categoryValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var raw) && Enum.IsDefined(typeof(GameCategory), raw))
            {
                proposedCategories |= (GameCategory)raw;
            }
        }

        if (proposedCategories == GameCategory.None)
        {
            ModelState.AddModelError("SelectedCategoryValues", Localize("Dashboard_Games_Categories_Required"));
            return await ReturnDashboardWithErrorsAsync(user, "games");
        }

        var proposedModes = GameMode.None;
        foreach (var modeValue in input.SelectedModeValues)
        {
            if (int.TryParse(modeValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var raw) && Enum.IsDefined(typeof(GameMode), raw))
            {
                proposedModes |= (GameMode)raw;
            }
        }

        if (proposedModes == GameMode.None)
        {
            ModelState.AddModelError("SelectedModeValues", Localize("Dashboard_Games_Modes_Required"));
            return await ReturnDashboardWithErrorsAsync(user, "games");
        }

        var parsedTags = ParseTags(input.TagsRaw);
        if (parsedTags.Count > 10)
        {
            ModelState.AddModelError(nameof(input.TagsRaw), Localize("Dashboard_Games_Tags_TooMany"));
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
            Modes = GameMode.None,
            ProposedModes = proposedModes,
            Categories = GameCategory.None,
            ProposedCategories = proposedCategories
        };

        foreach (var tag in parsedTags)
        {
            game.Tags.Add(new GameTag
            {
                Value = tag,
                IsApproved = false,
                AddedByUserId = user.Id,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

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

        var friendships = await _db.Friendships
            .AsNoTracking()
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == user.Id || f.AddresseeId == user.Id))
            .Select(f => new
            {
                FriendId = f.RequesterId == user.Id ? f.AddresseeId : f.RequesterId,
                f.CreatedAtUtc
            })
            .ToListAsync();

        var friendIds = friendships
            .Select(f => f.FriendId)
            .Distinct()
            .ToList();

        var friendProfiles = await _db.Users
            .AsNoTracking()
            .Where(u => friendIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl, u.Email, u.UserName })
            .ToDictionaryAsync(u => u.Id);

        var unknownFriend = Localize("Dashboard_Friends_Unknown");

        var friendVms = friendships
            .Select(f =>
            {
                friendProfiles.TryGetValue(f.FriendId, out var profile);
                var displayName = profile is not null
                    ? DisplayNameFormatter.Format(profile.DisplayName, profile.Email, profile.UserName)
                    : string.Empty;

                if (string.IsNullOrWhiteSpace(displayName))
                {
                    displayName = unknownFriend;
                }
                return new FriendViewModel
                {
                    DisplayName = displayName,
                    AvatarUrl = profile?.AvatarUrl,
                    Since = f.CreatedAtUtc
                };
            })
            .OrderBy(f => f.DisplayName, StringComparer.CurrentCultureIgnoreCase)
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

        var formattedDisplayName = DisplayNameFormatter.Format(user);

        var profile = new ProfileSectionViewModel
        {
            DisplayName = formattedDisplayName,
            PendingDisplayName = user.PendingDisplayName,
            PendingDisplayNameRequestedAtUtc = user.PendingDisplayNameRequestedAtUtc,
            DisplayNameChangeAvailableAtUtc = CalculateNextDisplayNameChangeAt(user),
            BirthMonth = user.BirthMonth,
            BirthDay = user.BirthDay,
            IsBirthdayToday = IsBirthdayToday(user.BirthMonth, user.BirthDay),
            AvatarUrl = user.AvatarUrl,
            Email = user.Email ?? string.Empty,
            DisplayNameVisibility = user.DisplayNameVisibility,
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
            NewGame = BuildEmptyCreateGameForm(),
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
            vm.Profile.DisplayName = DisplayNameFormatter.Format(displayNameState.AttemptedValue);
        }

        vm.Profile.DisplayNameVisibility = GetVisibilityFromState(nameof(UpdateProfileInputModel.DisplayNameVisibility));
        vm.Profile.BirthDateVisibility = GetVisibilityFromState(nameof(UpdateProfileInputModel.BirthDateVisibility));
        vm.Profile.EmailVisibility = GetVisibilityFromState(nameof(UpdateProfileInputModel.EmailVisibility));

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.BirthMonth), out var monthState) &&
            int.TryParse(monthState.AttemptedValue, out var monthValue))
        {
            vm.Profile.BirthMonth = monthValue;
        }

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.BirthDay), out var dayState) &&
            int.TryParse(dayState.AttemptedValue, out var dayValue))
        {
            vm.Profile.BirthDay = dayValue;
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

        if (ModelState.TryGetValue(nameof(CreateGameFormViewModel.TagsRaw), out var tagsState))
        {
            vm.NewGame.TagsRaw = tagsState.AttemptedValue;
        }

        if (Request.Form.TryGetValue("SelectedCategoryValues", out var categories))
        {
            vm.NewGame.SelectedCategoryValues = categories.ToList();
        }

        if (Request.Form.TryGetValue("SelectedModeValues", out var modes))
        {
            vm.NewGame.SelectedModeValues = modes.ToList();
        }

        vm.NewGame.CategoryOptions = BuildCategoryOptions(vm.NewGame.SelectedCategoryValues);
        vm.NewGame.ModeOptions = BuildModeOptions(vm.NewGame.SelectedModeValues);

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

    private static DateTime? CalculateNextDisplayNameChangeAt(ApplicationUser user)
    {
        var reference = user.DisplayNameLastApprovedAtUtc ?? user.CreatedAtUtc;
        if (reference == default)
        {
            return null;
        }

        return reference.AddMonths(1);
    }

    private static bool IsValidDayMonthCombination(int month, int day)
    {
        if (month < 1 || month > 12)
        {
            return false;
        }

        if (day < 1)
        {
            return false;
        }

        var referenceYear = month == 2 && day == 29 ? 2020 : 2000;
        var maxDay = DateTime.DaysInMonth(referenceYear, month);
        return day <= maxDay;
    }

    private static bool IsBirthdayToday(int? month, int? day)
    {
        if (!month.HasValue || !day.HasValue)
        {
            return false;
        }

        var today = DateTime.UtcNow;
        return month.Value == today.Month && day.Value == today.Day;
    }

    private static IReadOnlyList<string> ParseTags(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Array.Empty<string>();
        }

        var tokens = raw
            .Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(t => Regex.Replace(t.Trim(), "[^a-zA-Z0-9#+-]", " "))
            .Select(t => Regex.Replace(t, "\\s+", " ").Trim())
            .Where(t => t.Length >= 2)
            .Select(t => t.Length > 40 ? t[..40] : t)
            .Select(t => t.ToLowerInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(10)
            .ToList();

        return tokens;
    }

    private CreateGameFormViewModel BuildEmptyCreateGameForm()
    {
        var form = new CreateGameFormViewModel();
        form.CategoryOptions = BuildCategoryOptions();
        form.ModeOptions = BuildModeOptions();
        return form;
    }

    private IReadOnlyList<SelectListItem> BuildVisibilityOptions()
    {
        return new List<SelectListItem>
        {
            new SelectListItem
            {
                Value = ((int)ProfileVisibility.Everyone).ToString(CultureInfo.InvariantCulture),
                Text = Localize("Dashboard_Profile_Visibility_Everyone")
            },
            new SelectListItem
            {
                Value = ((int)ProfileVisibility.Friends).ToString(CultureInfo.InvariantCulture),
                Text = Localize("Dashboard_Profile_Visibility_Friends")
            },
            new SelectListItem
            {
                Value = ((int)ProfileVisibility.OwnerOnly).ToString(CultureInfo.InvariantCulture),
                Text = Localize("Dashboard_Profile_Visibility_Owner")
            }
        };

    }

    private IReadOnlyList<SelectListItem> BuildCategoryOptions(IReadOnlyCollection<string>? selectedValues = null)
    {
        var selected = selectedValues is null
            ? new HashSet<string>(StringComparer.Ordinal)
            : new HashSet<string>(selectedValues, StringComparer.Ordinal);

        return GameMetadataOptions.CategoryDefinitions
            .Select(option => new SelectListItem
            {
                Value = ((int)option.Category).ToString(CultureInfo.InvariantCulture),
                Text = Localize(option.ResourceKey, option.Category.ToString()),
                Selected = selected.Contains(((int)option.Category).ToString(CultureInfo.InvariantCulture))
            })
            .ToList();
    }

    private IReadOnlyList<SelectListItem> BuildModeOptions(IReadOnlyCollection<string>? selectedValues = null)
    {
        var selected = selectedValues is null
            ? new HashSet<string>(StringComparer.Ordinal)
            : new HashSet<string>(selectedValues, StringComparer.Ordinal);

        return GameMetadataOptions.ModeDefinitions
            .Select(option => new SelectListItem
            {
                Value = ((int)option.Mode).ToString(CultureInfo.InvariantCulture),
                Text = Localize(option.ResourceKey, option.Mode.ToString()),
                Selected = selected.Contains(((int)option.Mode).ToString(CultureInfo.InvariantCulture))
            })
            .ToList();
    }

    private IReadOnlyList<ProfileHighlightViewModel> BuildHighlights(ApplicationUser user, ProfileRankViewModel rank, ProfileBestGameViewModel? bestGame)
    {
        var highlights = new List<ProfileHighlightViewModel>();

        if (IsBirthdayToday(user.BirthMonth, user.BirthDay))
        {
            var birthdayName = DisplayNameFormatter.Format(user);
            if (string.IsNullOrWhiteSpace(birthdayName))
            {
                birthdayName = Localize("Dashboard_Profile_Highlight_Birthday_Default");
            }
            highlights.Add(new ProfileHighlightViewModel(
                Localize("Dashboard_Profile_Highlight_Birthday_Title"),
                string.Format(Localize("Dashboard_Profile_Highlight_Birthday_Body"), birthdayName)));
        }

        if (rank.NextDisplayName is not null && rank.XpRequiredForNext > 0)
        {
            highlights.Add(new ProfileHighlightViewModel(
                Localize("Dashboard_Profile_Highlight_NextRank_Title"),
                string.Format(Localize("Dashboard_Profile_Highlight_NextRank_Body"), rank.NextDisplayName, rank.XpRequiredForNext)));
        }
        else
        {
            highlights.Add(new ProfileHighlightViewModel(
                Localize("Dashboard_Profile_Highlight_MaxRank_Title"),
                Localize("Dashboard_Profile_Highlight_MaxRank_Body")));
        }

        if (bestGame is not null)
        {
            highlights.Add(new ProfileHighlightViewModel(
               Localize("Dashboard_Profile_Highlight_BestGame_Title"),
                string.Format(Localize("Dashboard_Profile_Highlight_BestGame_Body"), bestGame.Title, bestGame.AverageScore.ToString("0.##", CultureInfo.CurrentCulture))));
        }
        else
        {
            highlights.Add(new ProfileHighlightViewModel(
                Localize("Dashboard_Profile_Highlight_NoBestGame_Title"),
                Localize("Dashboard_Profile_Highlight_NoBestGame_Body")));
        }

        var tipIndex = GetTipIndex(user.Id);
        var tip = ProfileTips[tipIndex];
        highlights.Add(new ProfileHighlightViewModel(
            Localize(tip.TitleKey),
            Localize(tip.BodyKey)));

        return highlights;
    }

    private string Localize(string key, string? fallback = null)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return string.Empty;
        }

        var localized = _localizer[key];
        if (!localized.ResourceNotFound && !string.IsNullOrWhiteSpace(localized.Value))
        {
            return localized.Value;
        }

        if (!string.IsNullOrWhiteSpace(fallback))
        {
            return fallback;
        }

        var friendly = Regex.Replace(key, "([a-z])([A-Z])", "$1 $2");
        friendly = friendly.Replace('_', ' ');
        friendly = Regex.Replace(friendly, "\\s+", " ").Trim();

        if (string.IsNullOrWhiteSpace(friendly))
        {
            return key;
        }

        return CultureInfo.CurrentUICulture.TextInfo.ToTitleCase(friendly.ToLower(CultureInfo.CurrentUICulture));
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
