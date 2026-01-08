using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using Bgp.Domain.Enums;
using Bgp.Web.Helpers;
using Bgp.Web.Resources;
using Bgp.Web.ViewModels;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.Models;

public class DashboardViewModel
{
    public IReadOnlyList<GameSummaryViewModel> Games { get; init; } = Array.Empty<GameSummaryViewModel>();
    public IReadOnlyList<GameSummaryViewModel> MyGames { get; init; } = Array.Empty<GameSummaryViewModel>();
    public ProfileSectionViewModel Profile { get; init; } = new();
    public SecuritySectionViewModel Security { get; init; } = new();
    public PreferencesSectionViewModel Preferences { get; init; } = new();
    public DashboardStatsViewModel Stats { get; init; } = new();
    public CreateGameFormViewModel NewGame { get; init; } = new();
    public IReadOnlyList<FriendViewModel> Friends { get; init; } = Array.Empty<FriendViewModel>();
    public FriendLeaderboardCollectionViewModel FriendLeaderboards { get; init; } = new();
    public GlobalRankingViewModel GlobalRanking { get; init; } = new();
    public IReadOnlyList<NotificationViewModel> Notifications { get; init; } = Array.Empty<NotificationViewModel>();
}

public class NotificationViewModel
{
    public Guid Id { get; init; }
    public string Message { get; init; } = string.Empty;
    public string? Link { get; init; }
    public DateTime CreatedAtUtc { get; init; }
}

public record GameSummaryViewModel(Guid Id, string Title, string Slug, string? CoverImagePath, double AverageRating, GameApprovalStatus ApprovalStatus, DateTime CreatedAtUtc, DateTime? RejectedAtUtc, string? ModerationNotes);

public class ProfileSectionViewModel
{
    public string DisplayName { get; set; } = string.Empty;
    public string? PendingDisplayName { get; set; }
    public DateTime? PendingDisplayNameRequestedAtUtc { get; set; }
    public DateTime? DisplayNameChangeAvailableAtUtc { get; set; }
    public int? BirthMonth { get; set; }
    public int? BirthDay { get; set; }
    public bool IsBirthdayToday { get; set; }
    public string? AvatarUrl { get; set; }
    public string Email { get; set; } = string.Empty;
    public ProfileVisibility DisplayNameVisibility { get; set; } = ProfileVisibility.Everyone;
    public ProfileVisibility BirthDateVisibility { get; set; } = ProfileVisibility.OwnerOnly;
    public ProfileVisibility EmailVisibility { get; set; } = ProfileVisibility.OwnerOnly;
    public string? StatusMessage { get; set; }
    public UserPresenceStatus PresenceStatus { get; set; } = UserPresenceStatus.Available;
    public bool IsInvisible { get; set; }
    public ProfileRankViewModel Rank { get; set; } = new();
    public ProfileBestGameViewModel? BestGame { get; set; }
    public IReadOnlyList<ProfileHighlightViewModel> Highlights { get; set; } = Array.Empty<ProfileHighlightViewModel>();
    public IReadOnlyList<ProfileGoalViewModel> DailyGoals { get; set; } = Array.Empty<ProfileGoalViewModel>();
    public bool HasAvatar => !string.IsNullOrWhiteSpace(AvatarUrl);
    public IReadOnlyList<SelectListItem> VisibilityOptions { get; set; } = Array.Empty<SelectListItem>();
}

public class ProfileRankViewModel
{
    public string Tier { get; set; } = string.Empty;
    public string? Division { get; set; }
    public string? NextTier { get; set; }
    public string? NextDivision { get; set; }
    public int ExperiencePoints { get; set; }
    public int CurrentThreshold { get; set; }
    public int NextThreshold { get; set; }
    public int XpIntoCurrent { get; set; }
    public int XpRequiredForNext { get; set; }
    public int ProgressPercent { get; set; }
    public string AccentColor { get; set; } = "#38bdf8";
    public string AccentHighlightColor { get; set; } = "#a855f7";
    public string AccentGlowColor { get; set; } = "rgba(56,189,248,0.45)";
    public string? TrophyImage { get; set; }
    public string? NextTrophyImage { get; set; }
    public string? NextAccentColor { get; set; }
    public string? NextAccentHighlightColor { get; set; }
    public string? NextAccentGlowColor { get; set; }

    public string DisplayName => string.IsNullOrWhiteSpace(Division) ? Tier : $"{Tier} {Division}";
    public string? NextDisplayName => NextTier is null && NextDivision is null
        ? null
        : string.IsNullOrWhiteSpace(NextDivision)
            ? NextTier
            : $"{NextTier} {NextDivision}";
}

public record ProfileHighlightViewModel(string Title, string Description);

public record ProfileGoalViewModel(string Title, string Description, bool IsCompleted);
public class ProfileBestGameViewModel
{
    public string Title { get; set; } = string.Empty;
    public double AverageScore { get; set; }
    public DateTime LastPlayedAt { get; set; }
}

public class PlayerProfileViewModel
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public bool DisplayNameHidden { get; set; }
    public string? AvatarUrl { get; set; }
    public ProfileRankViewModel Rank { get; set; } = new();
    public string? StatusMessage { get; set; }
    public string PresenceLabel { get; set; } = string.Empty;
    public UserPresenceStatus PresenceStatus { get; set; } = UserPresenceStatus.Offline;
    public bool IsInvisible { get; set; }
    public IReadOnlyList<ProfileHighlightViewModel> Highlights { get; set; } = Array.Empty<ProfileHighlightViewModel>();
    public IReadOnlyList<ProfileGoalViewModel> DailyGoals { get; set; } = Array.Empty<ProfileGoalViewModel>();
    public ProfileBestGameViewModel? BestGame { get; set; }
    public string EmailLabel { get; set; } = string.Empty;
    public bool ShowEmail { get; set; }
    public string BirthDateLabel { get; set; } = string.Empty;
    public bool ShowBirthDate { get; set; }
    public bool IsFriend { get; set; }
    public bool HasPendingRequest { get; set; }
    public bool IsSelf { get; set; }
    public DateTime? FriendshipSince { get; set; }
    public bool BlockedByViewer { get; set; }
    public bool BlockedByTarget { get; set; }
    public string RelationshipLabel { get; set; } = string.Empty;
    public string RelationshipTone { get; set; } = "neutral";
}

public class SecuritySectionViewModel
{
    public string Email { get; set; } = string.Empty;
    public RecoverySettingsFormViewModel Recovery { get; set; } = new();
    public bool HasRecoveryConfigured { get; set; }
}

public class PreferencesSectionViewModel
{
    public string PreferredLanguage { get; set; } = "system";
    public string PreferredTheme { get; set; } = "system";
    public bool EnableEmailNotifications { get; set; } = true;
    public bool EnableFriendInvites { get; set; } = true;
    public IReadOnlyList<SelectListItem> LanguageOptions { get; set; } = Array.Empty<SelectListItem>();
    public IReadOnlyList<SelectListItem> ThemeOptions { get; set; } = Array.Empty<SelectListItem>();
}

public class RecoverySettingsFormViewModel
{
    public string SecurityQuestion1 { get; set; } = string.Empty;
    public string? SecurityQuestion1Custom { get; set; }
    public string SecurityAnswer1 { get; set; } = string.Empty;
    public bool HasSecurityAnswer1 { get; set; }

    public string SecurityQuestion2 { get; set; } = string.Empty;
    public string? SecurityQuestion2Custom { get; set; }
    public string SecurityAnswer2 { get; set; } = string.Empty;
    public bool HasSecurityAnswer2 { get; set; }

    public string SecurityQuestion3 { get; set; } = string.Empty;
    public string? SecurityQuestion3Custom { get; set; }
    public string SecurityAnswer3 { get; set; } = string.Empty;
    public bool HasSecurityAnswer3 { get; set; }

    public IReadOnlyList<SecurityQuestionOptionVm> SecurityQuestionOptions { get; set; } = Array.Empty<SecurityQuestionOptionVm>();
}

public class DashboardStatsViewModel
{
    public int UploadedGames { get; set; }
    public int TotalScores { get; set; }
    public int TotalReviews { get; set; }
    public int TotalRatings { get; set; }
    public int TotalComments { get; set; }
    public int DailyLoginCount { get; set; }
    public int MultiplayerMatches { get; set; }
    public int FriendsCount { get; set; }
    public int DailyGoalsCompleted { get; set; }
    public IReadOnlyList<GamePerformanceStat> GamePerformances { get; set; } = Array.Empty<GamePerformanceStat>();
    public DateTime? LastScoreSubmittedAt { get; set; }
    public int BonusExperience { get; set; }
}

public record GamePerformanceStat(
    Guid GameId,
    string Title,
    int TotalMatches,
    double BestScore,
    int RankPosition,
    int TotalPlayers,
    DateTime LastPlayedAt);

public class CreateGameFormViewModel
{
    [Required, MaxLength(120)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public string? Rules { get; set; }

    public IFormFile? CoverImage { get; set; }

    [Required, MaxLength(32)]
    public string Version { get; set; } = "1.0.0";

    [Required]
    public IFormFile? Package { get; set; }

    public List<string> SelectedCategoryValues { get; set; } = new();

    public List<string> SelectedModeValues { get; set; } = new();

    [MaxLength(200)]
    public string? TagsRaw { get; set; }

    public IReadOnlyList<SelectListItem> CategoryOptions { get; set; } = Array.Empty<SelectListItem>();

    public IReadOnlyList<SelectListItem> ModeOptions { get; set; } = Array.Empty<SelectListItem>();
}

public class FriendViewModel
{
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public DateTime Since { get; set; }
}

public class FriendLeaderboardCollectionViewModel
{
    public IReadOnlyList<FriendLeaderboardGameViewModel> Games { get; init; } = Array.Empty<FriendLeaderboardGameViewModel>();
    public Guid? SelectedGameId { get; init; }
}

public class FriendLeaderboardGameViewModel
{
    public Guid GameId { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Slug { get; init; } = string.Empty;
    public string? CoverImagePath { get; init; }
    public double AverageRating { get; init; }
    public DateTime? LastActivityAt { get; init; }
    public IReadOnlyList<FriendLeaderboardEntryViewModel> TopPlayers { get; init; } = Array.Empty<FriendLeaderboardEntryViewModel>();
}

public class FriendLeaderboardEntryViewModel
{
    public string UserId { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public double BestScore { get; init; }
    public int Rank { get; init; }
    public string? AvatarUrl { get; init; }
    public bool IsCurrentUser { get; init; }
}

public class UpdateProfileInputModel
{
    [Required, MaxLength(120)]
    public string DisplayName { get; set; } = string.Empty;

    public string? DisplayNamePassword { get; set; }


    [Range(1, 12)]
    public int? BirthMonth { get; set; }

    [Range(1, 31)]
    public int? BirthDay { get; set; }

    public ProfileVisibility DisplayNameVisibility { get; set; } = ProfileVisibility.Everyone;
    public ProfileVisibility BirthDateVisibility { get; set; } = ProfileVisibility.OwnerOnly;
    public ProfileVisibility EmailVisibility { get; set; } = ProfileVisibility.OwnerOnly;

    [MaxLength(10)]
    public string PreferredLanguage { get; set; } = "system";

    [MaxLength(20)]
    public string PreferredTheme { get; set; } = "system";

    public bool EnableEmailNotifications { get; set; } = true;

    public bool EnableFriendInvites { get; set; } = true;

    public IFormFile? Avatar { get; set; }
}

public class UpdateEmailInputModel
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}

public class ChangePasswordInputModel
{
    [Required]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required, MinLength(8)]
    public string NewPassword { get; set; } = string.Empty;

    [Compare(nameof(NewPassword))]
    public string ConfirmPassword { get; set; } = string.Empty;

}

public class UpdateRecoveryQuestionsInputModel : IValidatableObject
{
    [Required]
    public string SecurityQuestion1 { get; set; } = string.Empty;

    public string? SecurityQuestion1Custom { get; set; }


    [MinLength(3, ErrorMessageResourceType = typeof(SharedResource), ErrorMessageResourceName = "Auth_SecurityQuestions_Answer_MinLength")]
    public string SecurityAnswer1 { get; set; } = string.Empty;
    public bool HasExistingAnswer1 { get; set; }

    [Required]
    public string SecurityQuestion2 { get; set; } = string.Empty;

    public string? SecurityQuestion2Custom { get; set; }


    [MinLength(3, ErrorMessageResourceType = typeof(SharedResource), ErrorMessageResourceName = "Auth_SecurityQuestions_Answer_MinLength")]
    public string SecurityAnswer2 { get; set; } = string.Empty;
    public bool HasExistingAnswer2 { get; set; }

    [Required]
    public string SecurityQuestion3 { get; set; } = string.Empty;

    public string? SecurityQuestion3Custom { get; set; }


    [MinLength(3, ErrorMessageResourceType = typeof(SharedResource), ErrorMessageResourceName = "Auth_SecurityQuestions_Answer_MinLength")]
    public string SecurityAnswer3 { get; set; } = string.Empty;
    public bool HasExistingAnswer3 { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        var localizer = validationContext.GetService(typeof(IStringLocalizer<SharedResource>)) as IStringLocalizer<SharedResource>;
        string Localize(string key) => localizer?[key].Value ?? key;

        var questionEntries = new[]
         {
            (Key: SecurityQuestion1, Custom: SecurityQuestion1Custom),
            (Key: SecurityQuestion2, Custom: SecurityQuestion2Custom),
            (Key: SecurityQuestion3, Custom: SecurityQuestion3Custom)
        };
        var questionKeys = questionEntries.Select(entry => entry.Key).ToArray();
        if (questionKeys.Any(string.IsNullOrWhiteSpace))
        {
            yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_Required"), new[]
            {
                nameof(SecurityQuestion1), nameof(SecurityQuestion2), nameof(SecurityQuestion3)
            });
            yield break;
        }

        if (!HasExistingAnswer1 && string.IsNullOrWhiteSpace(SecurityAnswer1))
        {
            yield return new ValidationResult(Localize("Auth_SecurityQuestions_Answer_Required"), new[] { nameof(SecurityAnswer1) });
        }

        if (!HasExistingAnswer2 && string.IsNullOrWhiteSpace(SecurityAnswer2))
        {
            yield return new ValidationResult(Localize("Auth_SecurityQuestions_Answer_Required"), new[] { nameof(SecurityAnswer2) });
        }

        if (!HasExistingAnswer3 && string.IsNullOrWhiteSpace(SecurityAnswer3))
        {
            yield return new ValidationResult(Localize("Auth_SecurityQuestions_Answer_Required"), new[] { nameof(SecurityAnswer3) });
        }

        var normalizedKeys = questionEntries.Select(entry =>
        {
            var key = entry.Key?.Trim() ?? string.Empty;
            if (string.Equals(key, SecurityQuestionCatalog.CustomKey, StringComparison.OrdinalIgnoreCase))
            {
                var custom = (entry.Custom ?? string.Empty).Trim();
                return $"{key}:{custom}".ToLowerInvariant();
            }
            return key.ToLowerInvariant();
        });

        if (normalizedKeys.GroupBy(x => x).Any(g => g.Count() > 1))
        {
            yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_Distinct"), new[]
            {
                nameof(SecurityQuestion1), nameof(SecurityQuestion2), nameof(SecurityQuestion3)
            });
        }

        IEnumerable<ValidationResult> ValidateCustom(string key, string? custom, string questionMemberName, string customMemberName)
        {
            var option = SecurityQuestionCatalog.Find(key);
            if (option is null)
            {
                yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_Invalid"), new[] { questionMemberName });
                yield break;
            }

            if (option.AllowsCustomPrompt && string.IsNullOrWhiteSpace(custom))
            {
                yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_CustomRequired"), new[] { customMemberName });
            }
        }

        foreach (var result in ValidateCustom(SecurityQuestion1, SecurityQuestion1Custom, nameof(SecurityQuestion1), nameof(SecurityQuestion1Custom)))
        {
            yield return result;
        }

        foreach (var result in ValidateCustom(SecurityQuestion2, SecurityQuestion2Custom, nameof(SecurityQuestion2), nameof(SecurityQuestion2Custom)))
        {
            yield return result;
        }

        foreach (var result in ValidateCustom(SecurityQuestion3, SecurityQuestion3Custom, nameof(SecurityQuestion3), nameof(SecurityQuestion3Custom)))
        {
            yield return result;
        }
    }
}