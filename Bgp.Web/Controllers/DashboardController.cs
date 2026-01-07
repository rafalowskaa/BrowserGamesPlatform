using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Bgp.Web.Models;
using Bgp.Web.Resources;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.ConstrainedExecution;
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
    private readonly GlobalRankingService _globalRankingService;

    private const long MaxAvatarBytes = 2 * 1024 * 1024;
    private const int AvatarTargetSize = 256;
    private const string ThemeCookieName = "bgp-theme";

    private static readonly Regex SlugRegex = new("[^a-z0-9-]", RegexOptions.Compiled);
    private static readonly Regex VersionSanitizer = new("[^a-zA-Z0-9._-]", RegexOptions.Compiled);
    private static readonly string[] SupportedLanguages = { "system", "en", "pl" };
    private static readonly string[] SupportedThemes = { "dark", "contrast" };
    private static readonly (string TitleKey, string BodyKey)[] ProfileTips =
    {
        ("Dashboard_Profile_Tip_Strategy_Title", "Dashboard_Profile_Tip_Strategy_Body"),
        ("Dashboard_Profile_Tip_Focus_Title", "Dashboard_Profile_Tip_Focus_Body"),
        ("Dashboard_Profile_Tip_Routine_Title", "Dashboard_Profile_Tip_Routine_Body"),
        ("Dashboard_Profile_Tip_Teamplay_Title", "Dashboard_Profile_Tip_Teamplay_Body"),
        ("Dashboard_Profile_Tip_Balance_Title", "Dashboard_Profile_Tip_Balance_Body")
    };

    public DashboardController(
        UserManager<ApplicationUser> users,
        SignInManager<ApplicationUser> signInManager,
        AppDbContext db,
        IWebHostEnvironment env,
        ILogger<DashboardController> logger,
        IStringLocalizer<SharedResource> localizer,
        GlobalRankingService globalRankingService)
    {
        _users = users;
        _signInManager = signInManager;
        _db = db;
        _env = env;
        _logger = logger;
        _localizer = localizer;
        _globalRankingService = globalRankingService;
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

    [HttpGet]
    public Task<IActionResult> Profile(string? panel = null) => Index("profile", panel);

    [HttpGet]
    public Task<IActionResult> Stats() => Index("stats");

    [HttpGet]
    public Task<IActionResult> Games() => Index("games");

    [HttpGet]
    public Task<IActionResult> Settings(string? panel = null)
    {
        var targetPanel = string.IsNullOrWhiteSpace(panel) ? "preferences" : panel;
        return Index("profile", targetPanel);
    }

    [HttpGet("dashboard/profile/{id}")]
    public async Task<IActionResult> ViewProfile(string id)
    {
        var viewer = await _users.GetUserAsync(User);
        if (viewer is null)
        {
            return Challenge();
        }

        if (string.IsNullOrWhiteSpace(id))
        {
            return NotFound();
        }

        if (string.Equals(viewer.Id, id, StringComparison.Ordinal)
           || string.Equals(viewer.UserName, id, StringComparison.OrdinalIgnoreCase))
        {
            return RedirectToAction(nameof(Index), new { tab = "profile" });
        }

        var target = await _users.FindByNameAsync(id) ?? await _users.FindByIdAsync(id);
        if (target is null || target.IsBlocked)
        {
            return NotFound();
        }

        if (!string.IsNullOrWhiteSpace(target.UserName)
            && !string.Equals(target.UserName, id, StringComparison.OrdinalIgnoreCase))
        {
            return RedirectToAction(nameof(ViewProfile), new { id = target.UserName });
        }

        var relationship = await GetRelationshipAsync(viewer.Id, target.Id);
        var targetViewModel = await BuildViewModelAsync(target);
        var model = BuildPublicProfileViewModel(targetViewModel.Profile, target, relationship, viewer.Id);

        ViewData["ActiveTab"] = "profile";
        return View("PlayerProfile", model);
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

            if (string.IsNullOrWhiteSpace(input.DisplayNamePassword))
            {
                ModelState.AddModelError(nameof(input.DisplayNamePassword), Localize("Dashboard_Profile_DisplayName_ConfirmPasswordError"));
                return await ReturnDashboardWithErrorsAsync(user, "profile", "info");
            }

            if (!await _users.CheckPasswordAsync(user, input.DisplayNamePassword))
            {
                ModelState.AddModelError(nameof(input.DisplayNamePassword), Localize("Dashboard_Profile_DisplayName_InvalidPassword"));
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
        user.PreferredLanguage = NormalizePreference(input.PreferredLanguage, SupportedLanguages, "system");
        user.PreferredTheme = NormalizePreference(input.PreferredTheme, SupportedThemes, "dark");
        user.EnableEmailNotifications = input.EnableEmailNotifications;
        user.EnableFriendInvites = input.EnableFriendInvites;


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

            var cacheBuster = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            user.AvatarUrl = $"/uploads/avatars/{fileName}?v={cacheBuster}";
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
        ApplyPreferenceCookies(user);

        if (IsAjaxRequest())
        {
            return Json(new
            {
                success = true,
                displayNameRequested,
                displayName = user.DisplayName,
                pendingDisplayName = user.PendingDisplayName,
                pendingDisplayNameRequestedAt = user.PendingDisplayNameRequestedAtUtc,
                displayNameChangeAvailableAt = CalculateNextDisplayNameChangeAt(user),
                avatarUrl = user.AvatarUrl,
                preferredLanguage = user.PreferredLanguage,
                preferredTheme = user.PreferredTheme,
                enableEmailNotifications = user.EnableEmailNotifications,
                enableFriendInvites = user.EnableFriendInvites
            });
        }

        TempData["DashboardSuccess"] = displayNameRequested ? "DisplayNameRequested" : "ProfileUpdated";
        return RedirectToAction(nameof(Index), new { tab = "profile", panel = "info" });
    }

    private async Task<bool> TryProcessAndSaveAvatarAsync(IFormFile avatar, string filePath)
    {
        try
        {
            await using var sourceStream = avatar.OpenReadStream();
            using var image = await Image.LoadAsync<Rgba32>(sourceStream);

            image.Mutate(x => x.AutoOrient());

            var minSide = Math.Min(image.Width, image.Height);
            var cropRect = new Rectangle(
                (image.Width - minSide) / 2,
                (image.Height - minSide) / 2,
                minSide,
                minSide);

            var targetSizes = new[] { AvatarTargetSize, 224, 192, 160, 128 };
            var qualityLevels = new[] { 90, 80, 70, 60, 50, 40, 30, 20, 10 };
            byte[]? bestCandidate = null;

            foreach (var size in targetSizes)
            {
                using var working = image.Clone(ctx =>
                {
                    ctx.Crop(cropRect);
                    ctx.Resize(new ResizeOptions
                    {
                        Size = new Size(size, size),
                        Mode = ResizeMode.Crop,
                        Sampler = KnownResamplers.Lanczos3
                    });
                });
                foreach (var quality in qualityLevels)
                {
                    await using var outputStream = new MemoryStream();
                    var encoder = new JpegEncoder { Quality = quality };
                    await working.SaveAsync(outputStream, encoder);
                    var bytes = outputStream.ToArray();

                    if (bestCandidate is null || bytes.Length < bestCandidate.Length)
                    {
                        bestCandidate = bytes;
                    }

                    if (bytes.Length <= MaxAvatarBytes)
                    {
                        await System.IO.File.WriteAllBytesAsync(filePath, bytes);
                        return true;
                    }
                }
            }

            if (bestCandidate is not null)
            {
                _logger.LogWarning(
                    "Avatar image exceeded the maximum size after compression; saving best effort version with {Bytes} bytes.",
                    bestCandidate.LongLength);
                await System.IO.File.WriteAllBytesAsync(filePath, bestCandidate);
                return true;


            }

            _logger.LogWarning(
                "Failed to process avatar image – no suitable candidate produced by compression pipeline.");
            return false;
        }
        catch (UnknownImageFormatException ex)
        {
            _logger.LogWarning(ex, "Unsupported avatar image format uploaded.");
            return await TrySaveAvatarFallbackAsync(avatar, filePath);
        }
        catch (InvalidImageContentException ex)
        {
            _logger.LogWarning(ex, "Invalid avatar image content uploaded.");
            return await TrySaveAvatarFallbackAsync(avatar, filePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while processing avatar image.");
            return false;
        }
    }

    private async Task<bool> TrySaveAvatarFallbackAsync(IFormFile avatar, string filePath)
    {
        if (avatar.Length > MaxAvatarBytes)
        {
            _logger.LogWarning(
                "Avatar upload fallback skipped because the original file exceeds the size limit with {Bytes} bytes.",
                avatar.Length);
            return false;
        }

        try
        {
            await using var fallbackStream = avatar.OpenReadStream();
            await using var targetStream = System.IO.File.Create(filePath);
            await fallbackStream.CopyToAsync(targetStream);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Avatar fallback write failed.");
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
            return await ReturnDashboardWithErrorsAsync(user, "profile", "security");
        }

        var passwordValid = await _users.CheckPasswordAsync(user, input.Password);
        if (!passwordValid)
        {
            ModelState.AddModelError(nameof(input.Password), "Invalid password.");
            return await ReturnDashboardWithErrorsAsync(user, "profile", "security");
        }

        var newEmail = input.Email.Trim();
        var result = await _users.SetEmailAsync(user, newEmail);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "profile", "security");
        }

        user.EmailConfirmed = true;
        var updateResult = await _users.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            foreach (var error in updateResult.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "profile", "security");
        }

        await _signInManager.RefreshSignInAsync(user);
        _logger.LogInformation("User {UserId} updated email address.", user.Id);
        TempData["DashboardSuccess"] = "EmailUpdated";
        return RedirectToAction(nameof(Index), new { tab = "profile", panel = "security" });
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
            return await ReturnDashboardWithErrorsAsync(user, "profile", "security");
        }

        var result = await _users.ChangePasswordAsync(user, input.CurrentPassword, input.NewPassword);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "profile", "security");
        }

        await _signInManager.RefreshSignInAsync(user);
        _logger.LogInformation("User {UserId} changed password.", user.Id);
        TempData["DashboardSuccess"] = "PasswordUpdated";
        return RedirectToAction(nameof(Index), new { tab = "profile", panel = "security" });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> SignOutEverywhere()
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Challenge();
        }

        await _users.UpdateSecurityStampAsync(user);
        await _signInManager.RefreshSignInAsync(user);
        _logger.LogInformation("User {UserId} revoked active sessions.", user.Id);
        TempData["DashboardSuccess"] = "SessionsRevoked";
        return RedirectToAction(nameof(Index), new { tab = "profile", panel = "security" });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateRecoveryQuestions(UpdateRecoveryQuestionsInputModel input)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Challenge();
        }

        if (!ModelState.IsValid)
        {
            return await ReturnDashboardWithErrorsAsync(user, "profile", "security");
        }

        var custom1 = string.IsNullOrWhiteSpace(input.SecurityQuestion1Custom) ? null : input.SecurityQuestion1Custom.Trim();
        var custom2 = string.IsNullOrWhiteSpace(input.SecurityQuestion2Custom) ? null : input.SecurityQuestion2Custom.Trim();
        var custom3 = string.IsNullOrWhiteSpace(input.SecurityQuestion3Custom) ? null : input.SecurityQuestion3Custom.Trim();

        bool IsQuestionChanged(string? currentKey, string? currentCustom, string newKey, string? newCustom) =>
            !string.Equals(currentKey ?? string.Empty, newKey ?? string.Empty, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(currentCustom ?? string.Empty, newCustom ?? string.Empty, StringComparison.OrdinalIgnoreCase);

        var question1Changed = IsQuestionChanged(user.SecurityQuestion1Key, user.SecurityQuestion1CustomPrompt, input.SecurityQuestion1, custom1);
        var question2Changed = IsQuestionChanged(user.SecurityQuestion2Key, user.SecurityQuestion2CustomPrompt, input.SecurityQuestion2, custom2);
        var question3Changed = IsQuestionChanged(user.SecurityQuestion3Key, user.SecurityQuestion3CustomPrompt, input.SecurityQuestion3, custom3);

        var keepAnswer1 = input.HasExistingAnswer1 && string.Equals(input.SecurityAnswer1, SecurityAnswerHelper.MaskedToken, StringComparison.Ordinal);
        var keepAnswer2 = input.HasExistingAnswer2 && string.Equals(input.SecurityAnswer2, SecurityAnswerHelper.MaskedToken, StringComparison.Ordinal);
        var keepAnswer3 = input.HasExistingAnswer3 && string.Equals(input.SecurityAnswer3, SecurityAnswerHelper.MaskedToken, StringComparison.Ordinal);

        if ((keepAnswer1 && question1Changed) || (!keepAnswer1 && string.IsNullOrWhiteSpace(input.SecurityAnswer1)))
        {
            ModelState.AddModelError(nameof(input.SecurityAnswer1), Localize("Auth_SecurityQuestions_Answer_Required"));
        }
        if ((keepAnswer2 && question2Changed) || (!keepAnswer2 && string.IsNullOrWhiteSpace(input.SecurityAnswer2)))
        {
            ModelState.AddModelError(nameof(input.SecurityAnswer2), Localize("Auth_SecurityQuestions_Answer_Required"));
        }
        if ((keepAnswer3 && question3Changed) || (!keepAnswer3 && string.IsNullOrWhiteSpace(input.SecurityAnswer3)))
        {
            ModelState.AddModelError(nameof(input.SecurityAnswer3), Localize("Auth_SecurityQuestions_Answer_Required"));
        }

        if (!ModelState.IsValid)
        {
            return await ReturnDashboardWithErrorsAsync(user, "profile", "security");
        }

        user.SecurityQuestion1Key = input.SecurityQuestion1;
        user.SecurityQuestion1CustomPrompt = custom1;

        user.SecurityQuestion2Key = input.SecurityQuestion2;
        user.SecurityQuestion2CustomPrompt = custom2;

        user.SecurityQuestion3Key = input.SecurityQuestion3;
        user.SecurityQuestion3CustomPrompt = custom3;

        if (!keepAnswer1)
        {
            var answer1 = SecurityAnswerHelper.Normalize(input.SecurityAnswer1);
            user.SecurityQuestion1AnswerHash = _users.PasswordHasher.HashPassword(user, answer1);
        }
        if (!keepAnswer2)
        {
            var answer2 = SecurityAnswerHelper.Normalize(input.SecurityAnswer2);
            user.SecurityQuestion2AnswerHash = _users.PasswordHasher.HashPassword(user, answer2);
        }
        if (!keepAnswer3)
        {
            var answer3 = SecurityAnswerHelper.Normalize(input.SecurityAnswer3);
            user.SecurityQuestion3AnswerHash = _users.PasswordHasher.HashPassword(user, answer3);
        }

        var updateResult = await _users.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            foreach (var error in updateResult.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return await ReturnDashboardWithErrorsAsync(user, "profile", "security");
        }

        _logger.LogInformation("User {UserId} updated password recovery questions.", user.Id);
        TempData["DashboardSuccess"] = "RecoveryUpdated";
        return RedirectToAction(nameof(Index), new { tab = "profile", panel = "security" });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteNotification(Guid id)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Challenge();
        }

        var log = await _db.ActivityLogs.FirstOrDefaultAsync(l => l.Id == id);
        if (log is null)
        {
            return RedirectToAction(nameof(Index), new { tab = "notifications" });
        }

        var canDelete = string.Equals(log.TargetUserId, user.Id, StringComparison.Ordinal);
        if (!canDelete && !string.IsNullOrWhiteSpace(log.ActorUserId))
        {
            canDelete = await _db.Friendships.AnyAsync(f =>
                f.Status == FriendshipStatus.Accepted &&
                ((f.RequesterId == user.Id && f.AddresseeId == log.ActorUserId) ||
                 (f.AddresseeId == user.Id && f.RequesterId == log.ActorUserId)));
        }

        if (!canDelete)
        {
            return Forbid();
        }

        _db.ActivityLogs.Remove(log);
        await _db.SaveChangesAsync();
        TempData["DashboardSuccess"] = "Dashboard_Notifications_Delete_Success";
        return RedirectToAction(nameof(Index), new { tab = "notifications" });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(200_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 200_000_000)]
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
            Rules = string.IsNullOrWhiteSpace(input.Rules) ? null : RulesContentHelper.SanitizeHtml(input.Rules),
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
                g.RejectedAtUtc,
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
                g.RejectedAtUtc,
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

        var rawFriendProfiles = await _db.Users
            .AsNoTracking()
            .Where(u => friendIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.AvatarUrl, u.Email, u.UserName })
            .ToListAsync();

        var profileLookup = new Dictionary<string, BasicProfile>(rawFriendProfiles.Count + 1, StringComparer.Ordinal);
        foreach (var friendProfile in rawFriendProfiles)
        {
            profileLookup[friendProfile.Id] = new BasicProfile(friendProfile.DisplayName, friendProfile.AvatarUrl, friendProfile.Email, friendProfile.UserName);
        }
        profileLookup[user.Id] = new BasicProfile(user.DisplayName, user.AvatarUrl, user.Email, user.UserName);

        var unknownFriend = Localize("Dashboard_Friends_Unknown");

        var friendVms = friendships
            .Select(f =>
            {
                profileLookup.TryGetValue(f.FriendId, out var friendProfile);
                var displayName = friendProfile is not null
                    ? DisplayNameFormatter.Format(friendProfile.DisplayName, friendProfile.Email, friendProfile.UserName)
                    : string.Empty;

                if (string.IsNullOrWhiteSpace(displayName))
                {
                    displayName = unknownFriend;
                }
                return new FriendViewModel
                {
                    DisplayName = displayName,
                    AvatarUrl = friendProfile?.AvatarUrl,
                    Since = f.CreatedAtUtc
                };
            })
            .OrderBy(f => f.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ToList();

        var friendLeaderboards = await BuildFriendLeaderboardsAsync(user, friendIds, profileLookup);

        var notificationTypes = new[]
        {
            ActivityLogType.FriendRequestSent,
            ActivityLogType.FriendRequestAccepted,
            ActivityLogType.GameInviteSent,
            ActivityLogType.GameInviteAccepted,
            ActivityLogType.CommentAdded,
            ActivityLogType.RatingSubmitted
        };

        var notificationLogs = await _db.ActivityLogs
            .AsNoTracking()
            .Where(l => notificationTypes.Contains(l.Type)
                        && (l.TargetUserId == user.Id
                            || (l.ActorUserId != null && friendIds.Contains(l.ActorUserId))))
            .OrderByDescending(l => l.CreatedAtUtc)
            .Take(50)
            .ToListAsync();

        var notificationActorIds = notificationLogs
            .Select(l => l.ActorUserId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();

        var notificationActors = notificationActorIds.Count == 0
            ? new Dictionary<string, string>()
            : await _db.Users
                .AsNoTracking()
                .Where(u => notificationActorIds.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
                .ToDictionaryAsync(u => u.Id, u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id));

        var notificationGameIds = notificationLogs
            .Where(l => l.GameId.HasValue)
            .Select(l => l.GameId!.Value)
            .Distinct()
            .ToList();

        var notificationGames = notificationGameIds.Count == 0
            ? new Dictionary<Guid, (string Title, string Slug)>()
            : await _db.Games
                .AsNoTracking()
                .Where(g => notificationGameIds.Contains(g.Id))
                .Select(g => new { g.Id, g.Title, g.Slug })
                .ToDictionaryAsync(g => g.Id, g => (g.Title, g.Slug));

        string BuildNotificationMessage(ActivityLog log)
        {
            var actorName = log.ActorUserId != null && notificationActors.TryGetValue(log.ActorUserId, out var name)
                ? name
                : Localize("Dashboard_Friends_Unknown");
            (string Title, string Slug) game = default;
            var hasGame = log.GameId.HasValue && notificationGames.TryGetValue(log.GameId.Value, out game);
            var gameTitle = hasGame ? game.Title : string.Empty;

            return log.Type switch
            {
                ActivityLogType.FriendRequestSent => string.Format(Localize("Dashboard_Notifications_FriendRequest"), actorName),
                ActivityLogType.FriendRequestAccepted => string.Format(Localize("Dashboard_Notifications_FriendAccepted"), actorName),
                ActivityLogType.GameInviteSent => string.Format(Localize("Dashboard_Notifications_GameInvite"), actorName, gameTitle),
                ActivityLogType.GameInviteAccepted => string.Format(Localize("Dashboard_Notifications_GameInviteAccepted"), actorName, gameTitle),
                ActivityLogType.CommentAdded when log.TargetUserId == user.Id
                    => string.Format(Localize("Dashboard_Notifications_CommentQuote"), actorName, gameTitle),
                ActivityLogType.CommentAdded => string.Format(Localize("Dashboard_Notifications_CommentAdded"), actorName, gameTitle),
                ActivityLogType.RatingSubmitted => string.Format(Localize("Dashboard_Notifications_Rating"), actorName, gameTitle),
                _ => string.Format(Localize("Dashboard_Notifications_Generic"), actorName)
            };
        }

        string? BuildNotificationLink(ActivityLog log)
        {
            if (log.Type is ActivityLogType.FriendRequestSent or ActivityLogType.FriendRequestAccepted)
            {
                return Url.Action(nameof(Index), new { tab = "friends" });
            }

            if (log.Type is ActivityLogType.GameInviteSent or ActivityLogType.GameInviteAccepted)
            {
                if (log.GameId.HasValue && notificationGames.TryGetValue(log.GameId.Value, out var game))
                {
                    return Url.Action("Details", "Games", new { slug = game.Slug, tab = "play" });
                }
                return Url.Action(nameof(Index), new { tab = "overview" });
            }

            if (log.Type is ActivityLogType.CommentAdded or ActivityLogType.RatingSubmitted)
            {
                if (log.GameId.HasValue && notificationGames.TryGetValue(log.GameId.Value, out var game))
                {
                    return Url.Action("Details", "Games", new { slug = game.Slug, tab = "reviews" });
                }
            }

            return null;
        }

        var notifications = notificationLogs
            .Select(log => new NotificationViewModel
            {
                Id = log.Id,
                Message = BuildNotificationMessage(log),
                Link = BuildNotificationLink(log),
                CreatedAtUtc = log.CreatedAtUtc
            })
            .ToList();

        var stats = new DashboardStatsViewModel
        {
            UploadedGames = await _db.Games.CountAsync(g => g.CreatedByUserId == user.Id),
            TotalScores = await _db.Scores.CountAsync(s => s.UserId == user.Id),
            TotalReviews = await _db.GameReviews.CountAsync(r => r.UserId == user.Id),
            FriendsCount = friendVms.Count,
            BonusExperience = user.BonusExperience
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

        var hasRecoveryConfigured = !string.IsNullOrWhiteSpace(user.SecurityQuestion1AnswerHash)
                                     && !string.IsNullOrWhiteSpace(user.SecurityQuestion2AnswerHash)
                                     && !string.IsNullOrWhiteSpace(user.SecurityQuestion3AnswerHash);
        var hasAvatar = !string.IsNullOrWhiteSpace(user.AvatarUrl);
        var dailyGoals = BuildDailyGoals(user, stats, hasAvatar, hasRecoveryConfigured);

        var rank = RankCalculator.CalculateRank(stats);

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
            StatusMessage = user.StatusMessage,
            PresenceStatus = user.PresenceStatus,
            IsInvisible = user.IsInvisible,
            Rank = rank,
            BestGame = bestGame,
            Highlights = BuildHighlights(user, rank, bestGame),
            VisibilityOptions = visibilityOptions
        };

        var recoveryOptions = SecurityQuestionCatalog.Options
            .Select(option => new SecurityQuestionOptionVm(option.Key, _localizer[option.ResourceKey].Value, option.AllowsCustomPrompt))
            .ToList();

        var recoveryForm = new RecoverySettingsFormViewModel
        {
            SecurityQuestion1 = user.SecurityQuestion1Key ?? string.Empty,
            SecurityQuestion1Custom = user.SecurityQuestion1CustomPrompt,
            SecurityAnswer1 = string.IsNullOrWhiteSpace(user.SecurityQuestion1AnswerHash) ? string.Empty : SecurityAnswerHelper.MaskedToken,
            HasSecurityAnswer1 = !string.IsNullOrWhiteSpace(user.SecurityQuestion1AnswerHash),
            SecurityQuestion2 = user.SecurityQuestion2Key ?? string.Empty,
            SecurityQuestion2Custom = user.SecurityQuestion2CustomPrompt,
            SecurityAnswer2 = string.IsNullOrWhiteSpace(user.SecurityQuestion2AnswerHash) ? string.Empty : SecurityAnswerHelper.MaskedToken,
            HasSecurityAnswer2 = !string.IsNullOrWhiteSpace(user.SecurityQuestion2AnswerHash),
            SecurityQuestion3 = user.SecurityQuestion3Key ?? string.Empty,
            SecurityQuestion3Custom = user.SecurityQuestion3CustomPrompt,
            SecurityAnswer3 = string.IsNullOrWhiteSpace(user.SecurityQuestion3AnswerHash) ? string.Empty : SecurityAnswerHelper.MaskedToken,
            HasSecurityAnswer3 = !string.IsNullOrWhiteSpace(user.SecurityQuestion3AnswerHash),
            SecurityQuestionOptions = recoveryOptions
        };

        profile.DailyGoals = dailyGoals;

        return new DashboardViewModel
        {
            Games = games,
            MyGames = myGames,

            Profile = profile,
            Security = new SecuritySectionViewModel
            {
                Email = user.Email ?? string.Empty,
                Recovery = recoveryForm,
                HasRecoveryConfigured = hasRecoveryConfigured
            },
            Preferences = new PreferencesSectionViewModel
            {
                PreferredLanguage = string.IsNullOrWhiteSpace(user.PreferredLanguage) ? "system" : user.PreferredLanguage!,
                PreferredTheme = string.IsNullOrWhiteSpace(user.PreferredTheme) ? "system" : user.PreferredTheme!,
                EnableEmailNotifications = user.EnableEmailNotifications,
                EnableFriendInvites = user.EnableFriendInvites,
                LanguageOptions = BuildLanguageOptions(user.PreferredLanguage),
                ThemeOptions = BuildThemeOptions(user.PreferredTheme)
            },

            Stats = stats,
            NewGame = BuildEmptyCreateGameForm(),
            Friends = friendVms,
            FriendLeaderboards = friendLeaderboards,
            GlobalRanking = await _globalRankingService.GetRankingAsync(user.Id),
            Notifications = notifications
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

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.PreferredLanguage), out var languageState) &&
           !string.IsNullOrWhiteSpace(languageState.AttemptedValue))
        {
            vm.Preferences.PreferredLanguage = NormalizePreference(languageState.AttemptedValue, SupportedLanguages, "system");
        }

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.PreferredTheme), out var themeState) &&
            !string.IsNullOrWhiteSpace(themeState.AttemptedValue))
        {
            vm.Preferences.PreferredTheme = NormalizePreference(themeState.AttemptedValue, SupportedThemes, "dark");
        }

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.EnableEmailNotifications), out var emailNotifyState))
        {
            vm.Preferences.EnableEmailNotifications = ParseBooleanState(emailNotifyState.AttemptedValue, vm.Preferences.EnableEmailNotifications);
        }

        if (ModelState.TryGetValue(nameof(UpdateProfileInputModel.EnableFriendInvites), out var friendNotifyState))
        {
            vm.Preferences.EnableFriendInvites = ParseBooleanState(friendNotifyState.AttemptedValue, vm.Preferences.EnableFriendInvites);
        }

        vm.Preferences.LanguageOptions = BuildLanguageOptions(vm.Preferences.PreferredLanguage);
        vm.Preferences.ThemeOptions = BuildThemeOptions(vm.Preferences.PreferredTheme);


        if (ModelState.TryGetValue(nameof(UpdateEmailInputModel.Email), out var emailState) &&
            !string.IsNullOrWhiteSpace(emailState.AttemptedValue))
        {
            vm.Security.Email = emailState.AttemptedValue!;
        }

        if (ModelState.TryGetValue(nameof(UpdateRecoveryQuestionsInputModel.SecurityQuestion1), out var sq1State))
        {
            vm.Security.Recovery.SecurityQuestion1 = sq1State.AttemptedValue ?? string.Empty;
        }

        if (ModelState.TryGetValue(nameof(UpdateRecoveryQuestionsInputModel.SecurityQuestion2), out var sq2State))
        {
            vm.Security.Recovery.SecurityQuestion2 = sq2State.AttemptedValue ?? string.Empty;
        }

        if (ModelState.TryGetValue(nameof(UpdateRecoveryQuestionsInputModel.SecurityQuestion3), out var sq3State))
        {
            vm.Security.Recovery.SecurityQuestion3 = sq3State.AttemptedValue ?? string.Empty;
        }

        if (ModelState.TryGetValue(nameof(UpdateRecoveryQuestionsInputModel.SecurityQuestion1Custom), out var sq1CustomState))
        {
            vm.Security.Recovery.SecurityQuestion1Custom = sq1CustomState.AttemptedValue;
        }

        if (ModelState.TryGetValue(nameof(UpdateRecoveryQuestionsInputModel.SecurityQuestion2Custom), out var sq2CustomState))
        {
            vm.Security.Recovery.SecurityQuestion2Custom = sq2CustomState.AttemptedValue;
        }

        if (ModelState.TryGetValue(nameof(UpdateRecoveryQuestionsInputModel.SecurityQuestion3Custom), out var sq3CustomState))
        {
            vm.Security.Recovery.SecurityQuestion3Custom = sq3CustomState.AttemptedValue;
        }

        if (ModelState.TryGetValue(nameof(UpdateRecoveryQuestionsInputModel.SecurityAnswer1), out var sa1State))
        {
            vm.Security.Recovery.SecurityAnswer1 = sa1State.AttemptedValue ?? string.Empty;
        }

        if (ModelState.TryGetValue(nameof(UpdateRecoveryQuestionsInputModel.SecurityAnswer2), out var sa2State))
        {
            vm.Security.Recovery.SecurityAnswer2 = sa2State.AttemptedValue ?? string.Empty;
        }

        if (ModelState.TryGetValue(nameof(UpdateRecoveryQuestionsInputModel.SecurityAnswer3), out var sa3State))
        {
            vm.Security.Recovery.SecurityAnswer3 = sa3State.AttemptedValue ?? string.Empty;
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

        if (ModelState.TryGetValue(nameof(CreateGameFormViewModel.Rules), out var rulesState))
        {
            vm.NewGame.Rules = rulesState.AttemptedValue;
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

        if (IsAjaxRequest())
        {
            Response.StatusCode = StatusCodes.Status422UnprocessableEntity;
            var errors = ModelState
                .Where(pair => pair.Value is { Errors.Count: > 0 })
                .ToDictionary(
                    pair => pair.Key,
                    pair => pair.Value!.Errors.Select(error => error.ErrorMessage).ToArray());
            return Json(new { success = false, errors });
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

    private IReadOnlyList<ProfileGoalViewModel> BuildDailyGoals(ApplicationUser user, DashboardStatsViewModel stats, bool hasAvatar, bool hasRecoveryConfigured)
    {
        var goals = new List<ProfileGoalViewModel>
        {
            new ProfileGoalViewModel(
                Localize("Dashboard_Profile_Goal_PlayMatch_Title"),
                Localize("Dashboard_Profile_Goal_PlayMatch_Body"),
                stats.TotalScores > 0),
            new ProfileGoalViewModel(
                Localize("Dashboard_Profile_Goal_AddAvatar_Title"),
                Localize("Dashboard_Profile_Goal_AddAvatar_Body"),
                hasAvatar),
            new ProfileGoalViewModel(
                Localize("Dashboard_Profile_Goal_CompleteProfile_Title"),
                Localize("Dashboard_Profile_Goal_CompleteProfile_Body"),
                hasRecoveryConfigured && user.BirthDay.HasValue && user.BirthMonth.HasValue)
        };

        stats.DailyGoalsCompleted = goals.Count(g => g.IsCompleted);

        return goals;
    }

    private async Task<FriendLeaderboardCollectionViewModel> BuildFriendLeaderboardsAsync(
        ApplicationUser currentUser,
        IReadOnlyCollection<string> friendIds,
        IReadOnlyDictionary<string, BasicProfile> profileLookup)
    {
        var participantIds = new HashSet<string>(friendIds, StringComparer.Ordinal);
        participantIds.Add(currentUser.Id);

        if (participantIds.Count == 0)
        {
            return new FriendLeaderboardCollectionViewModel();
        }

        var scoreGroups = await _db.Scores
            .AsNoTracking()
            .Where(s => participantIds.Contains(s.UserId))
            .GroupBy(s => new { s.GameId, s.UserId })
            .Select(g => new
            {
                g.Key.GameId,
                g.Key.UserId,
                BestScore = g.Max(x => x.Value),
                LastPlayed = g.Max(x => x.SubmittedAtUtc)
            })
            .ToListAsync();

        if (scoreGroups.Count == 0)
        {
            return new FriendLeaderboardCollectionViewModel();
        }

        var gameIds = scoreGroups.Select(g => g.GameId).Distinct().ToArray();
        var games = await _db.Games
            .AsNoTracking()
            .Where(g => gameIds.Contains(g.Id))
            .Select(g => new
            {
                g.Id,
                g.Title,
                g.Slug,
                g.CoverImagePath,
                Rating = g.Reviews.Any() ? g.Reviews.Average(r => r.Stars) : 0.0
            })
            .ToListAsync();

        var gameLookup = games.ToDictionary(g => g.Id);
        var leaderboards = new List<FriendLeaderboardGameViewModel>(games.Count);

        foreach (var gameGroup in scoreGroups.GroupBy(x => x.GameId))
        {
            if (!gameLookup.TryGetValue(gameGroup.Key, out var game))
            {
                continue;
            }

            var entries = gameGroup
                .OrderByDescending(x => x.BestScore)
                .ThenByDescending(x => x.LastPlayed)
                .Take(20)
                .Select((entry, index) =>
                {
                    profileLookup.TryGetValue(entry.UserId, out var profile);
                    var resolvedName = profile is not null
                        ? DisplayNameFormatter.Format(profile.DisplayName, profile.Email, profile.UserName)
                        : Localize("Dashboard_Friends_Unknown");

                    if (string.IsNullOrWhiteSpace(resolvedName))
                    {
                        resolvedName = Localize("Dashboard_Friends_Unknown");
                    }

                    return new FriendLeaderboardEntryViewModel
                    {
                        UserId = entry.UserId,
                        DisplayName = resolvedName,
                        BestScore = entry.BestScore,
                        Rank = index + 1,
                        AvatarUrl = profile?.AvatarUrl,
                        IsCurrentUser = string.Equals(entry.UserId, currentUser.Id, StringComparison.Ordinal)
                    };
                })
                .Where(e => !string.IsNullOrWhiteSpace(e.DisplayName))
                .ToList();

            if (entries.Count == 0)
            {
                continue;
            }

            var lastActivity = gameGroup.Max(x => x.LastPlayed);

            leaderboards.Add(new FriendLeaderboardGameViewModel
            {
                GameId = game.Id,
                Title = game.Title,
                Slug = game.Slug,
                CoverImagePath = game.CoverImagePath,
                AverageRating = game.Rating,
                LastActivityAt = lastActivity,
                TopPlayers = entries
            });
        }

        if (leaderboards.Count == 0)
        {
            return new FriendLeaderboardCollectionViewModel();
        }

        var orderedGames = leaderboards
            .OrderByDescending(g => g.LastActivityAt ?? DateTime.MinValue)
            .ThenBy(g => g.Title, StringComparer.CurrentCultureIgnoreCase)
            .ToList();

        return new FriendLeaderboardCollectionViewModel
        {
            Games = orderedGames,
            SelectedGameId = orderedGames.First().GameId
        };
    }

    private IReadOnlyList<SelectListItem> BuildLanguageOptions(string? current)
    {
        var normalized = NormalizePreference(current, SupportedLanguages, "system");
        var options = new (string Value, string Label)[]
        {
            ("system", Localize("Dashboard_Preferences_Language_System")),
            ("en", Localize("Dashboard_Preferences_Language_English")),
            ("pl", Localize("Dashboard_Preferences_Language_Polish"))
        };

        return options.Select(option => new SelectListItem
        {
            Value = option.Value,
            Text = option.Label,
            Selected = string.Equals(option.Value, normalized, StringComparison.OrdinalIgnoreCase)
        }).ToList();
    }

    private IReadOnlyList<SelectListItem> BuildThemeOptions(string? current)
    {
        var normalized = NormalizePreference(current, SupportedThemes, "dark");
        var options = new (string Value, string Label)[]
        {
            ("dark", Localize("Dashboard_Preferences_Theme_Dark")),
            ("contrast", Localize("Dashboard_Preferences_Theme_Contrast"))
        };

        return options.Select(option => new SelectListItem
        {
            Value = option.Value,
            Text = option.Label,
            Selected = string.Equals(option.Value, normalized, StringComparison.OrdinalIgnoreCase)
        }).ToList();
    }

    private static string NormalizePreference(string? value, IReadOnlyCollection<string> allowed, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return fallback;
        }

        var normalized = value.Trim().ToLowerInvariant();
        var match = allowed.FirstOrDefault(option => string.Equals(option, normalized, StringComparison.OrdinalIgnoreCase));
        return match ?? fallback;
    }

    private void ApplyPreferenceCookies(ApplicationUser user)
    {
        ApplyLanguageCookie(user.PreferredLanguage);
        ApplyThemeCookie(user.PreferredTheme);
    }

    private void ApplyLanguageCookie(string? preference)
    {
        var normalized = NormalizePreference(preference, SupportedLanguages, "system");
        if (normalized is "en" or "pl")
        {
            var cultureName = normalized == "pl" ? "pl-PL" : "en-US";
            var cookieValue = CookieRequestCultureProvider.MakeCookieValue(new RequestCulture(cultureName));
            Response.Cookies.Append(CookieRequestCultureProvider.DefaultCookieName, cookieValue, BuildPreferenceCookieOptions());
        }
        else
        {
            Response.Cookies.Delete(CookieRequestCultureProvider.DefaultCookieName);
        }
    }

    private void ApplyThemeCookie(string? preference)
    {
        var normalized = NormalizePreference(preference, SupportedThemes, "dark");
        if (normalized is "light" or "dark" or "contrast")
        {
            Response.Cookies.Append(ThemeCookieName, normalized, BuildPreferenceCookieOptions());
        }
        else
        {
            Response.Cookies.Delete(ThemeCookieName);
        }
    }

    private CookieOptions BuildPreferenceCookieOptions()
    {
        return new CookieOptions
        {
            IsEssential = true,
            Expires = DateTimeOffset.UtcNow.AddYears(1),
            SameSite = SameSiteMode.Lax,
            Secure = Request?.IsHttps ?? false
        };
    }

    private PlayerProfileViewModel BuildPublicProfileViewModel(ProfileSectionViewModel profile, ApplicationUser target, RelationshipInfo relationship, string viewerId)
    {
        var isSelf = string.Equals(viewerId, target.Id, StringComparison.Ordinal);
        var isFriend = relationship.IsFriend;
        var canSeeDisplayName = CanSee(profile.DisplayNameVisibility, isFriend, isSelf);
        var canSeeEmail = CanSee(profile.EmailVisibility, isFriend, isSelf);
        var canSeeBirthDate = CanSee(profile.BirthDateVisibility, isFriend, isSelf);

        var displayName = canSeeDisplayName
            ? DisplayNameFormatter.Format(target.DisplayName, target.Email, target.UserName, target.Id)
            : Localize("Dashboard_Profile_Private_DisplayName");

        var emailLabel = canSeeEmail && !string.IsNullOrWhiteSpace(target.Email)
            ? target.Email!
            : Localize("Dashboard_Profile_Private_Email");

        var showEmail = canSeeEmail && !string.IsNullOrWhiteSpace(target.Email);

        var showBirthDate = false;
        string birthDateLabel;
        if (canSeeBirthDate && profile.BirthMonth.HasValue && profile.BirthDay.HasValue)
        {
            var year = DateTime.UtcNow.Year;
            var day = Math.Min(DateTime.DaysInMonth(year, profile.BirthMonth.Value), profile.BirthDay.Value);
            var date = new DateTime(year, profile.BirthMonth.Value, day);
            birthDateLabel = date.ToString("MMMM dd", CultureInfo.CurrentCulture);
            showBirthDate = true;
        }
        else
        {
            birthDateLabel = Localize("Dashboard_Profile_Private_BirthDate");
        }

        var presenceLabel = target.IsInvisible
            ? Localize("Chat_Status_Invisible")
            : target.PresenceStatus switch
            {
                UserPresenceStatus.Available => Localize("Chat_Status_Available"),
                UserPresenceStatus.Away => Localize("Chat_Status_Away"),
                UserPresenceStatus.DoNotDisturb => Localize("Chat_Status_Dnd"),
                _ => Localize("Chat_Status_Offline")
            };

        var statusMessage = string.IsNullOrWhiteSpace(target.StatusMessage)
            ? null
            : target.StatusMessage!.Trim();

        var relationshipDisplay = BuildRelationshipLabel(relationship);

        return new PlayerProfileViewModel
        {
            UserId = target.Id,
            DisplayName = displayName,
            DisplayNameHidden = !canSeeDisplayName,
            AvatarUrl = profile.AvatarUrl,
            Rank = profile.Rank,
            StatusMessage = statusMessage,
            PresenceLabel = presenceLabel,
            PresenceStatus = target.PresenceStatus,
            IsInvisible = target.IsInvisible,
            Highlights = profile.Highlights,
            DailyGoals = profile.DailyGoals,
            BestGame = profile.BestGame,
            EmailLabel = emailLabel,
            ShowEmail = showEmail,
            BirthDateLabel = birthDateLabel,
            ShowBirthDate = showBirthDate,
            IsFriend = isFriend,
            HasPendingRequest = relationship.IsPending,
            IsSelf = isSelf,
            FriendshipSince = relationship.FriendshipSince,
            BlockedByViewer = relationship.BlockedByViewer,
            BlockedByTarget = relationship.BlockedByTarget,
            RelationshipLabel = relationshipDisplay.Text,
            RelationshipTone = relationshipDisplay.Tone
        };
    }

    private (string Text, string Tone) BuildRelationshipLabel(RelationshipInfo relationship)
    {
        if (relationship.BlockedByViewer)
        {
            return (Localize("Dashboard_Profile_View_Relationship_BlockedByYou"), "warning");
        }

        if (relationship.BlockedByTarget)
        {
            return (Localize("Dashboard_Profile_View_Relationship_BlockedYou"), "danger");
        }

        if (relationship.IsFriend)
        {
            if (relationship.FriendshipSince.HasValue)
            {
                var since = relationship.FriendshipSince.Value.ToLocalTime().ToString("d", CultureInfo.CurrentCulture);
                return (string.Format(Localize("Dashboard_Profile_View_Relationship_Friend"), since), "success");
            }

            return (Localize("Dashboard_Profile_View_Relationship_Friend_Short"), "success");
        }

        if (relationship.IsPending)
        {
            return (Localize("Dashboard_Profile_View_Relationship_Pending"), "info");
        }

        return (Localize("Dashboard_Profile_View_Relationship_None"), "muted");
    }

    private async Task<RelationshipInfo> GetRelationshipAsync(string viewerId, string targetId)
    {
        if (string.Equals(viewerId, targetId, StringComparison.Ordinal))
        {
            return new RelationshipInfo(true, false, false, false, null);
        }

        var relationship = await _db.Friendships
            .AsNoTracking()
            .Where(f => (f.RequesterId == viewerId && f.AddresseeId == targetId) ||
                        (f.RequesterId == targetId && f.AddresseeId == viewerId))
            .OrderByDescending(f => f.UpdatedAtUtc ?? f.CreatedAtUtc)
            .FirstOrDefaultAsync();

        if (relationship is null)
        {
            return new RelationshipInfo(false, false, false, false, null);
        }

        var isFriend = relationship.Status == FriendshipStatus.Accepted;
        var isPending = relationship.Status == FriendshipStatus.Pending;
        var blockedByViewer = relationship.Status == FriendshipStatus.Blocked &&
                              string.Equals(relationship.BlockedByUserId, viewerId, StringComparison.Ordinal);
        var blockedByTarget = relationship.Status == FriendshipStatus.Blocked &&
                              string.Equals(relationship.BlockedByUserId, targetId, StringComparison.Ordinal);
        DateTime? since = null;
        if (isFriend)
        {
            since = relationship.UpdatedAtUtc ?? relationship.CreatedAtUtc;
        }

        return new RelationshipInfo(isFriend, isPending, blockedByViewer, blockedByTarget, since);
    }

    private static bool CanSee(ProfileVisibility visibility, bool isFriend, bool isSelf) => visibility switch
    {
        ProfileVisibility.Everyone => true,
        ProfileVisibility.Friends => isFriend || isSelf,
        ProfileVisibility.OwnerOnly => isSelf,
        _ => false
    };

    private static bool ParseBooleanState(string? attemptedValue, bool fallback)
    {
        if (string.IsNullOrWhiteSpace(attemptedValue))
        {
            return fallback;
        }

        if (bool.TryParse(attemptedValue, out var parsed))
        {
            return parsed;
        }

        if (string.Equals(attemptedValue, "on", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (attemptedValue.Contains(',', StringComparison.Ordinal))
        {
            foreach (var part in attemptedValue.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (bool.TryParse(part, out var partValue))
                {
                    return partValue;
                }
            }
        }

        return fallback;
    }

    private bool IsAjaxRequest()
    {
        return Request?.Headers.TryGetValue("X-Requested-With", out var value) == true &&
               string.Equals(value, "XMLHttpRequest", StringComparison.OrdinalIgnoreCase);
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

    private sealed record BasicProfile(string? DisplayName, string? AvatarUrl, string? Email, string? UserName);

    private sealed record RelationshipInfo(bool IsFriend, bool IsPending, bool BlockedByViewer, bool BlockedByTarget, DateTime? FriendshipSince);

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