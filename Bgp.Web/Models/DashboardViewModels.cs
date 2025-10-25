using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Rendering;

namespace Bgp.Web.Models;

public class DashboardViewModel
{
    public IReadOnlyList<GameSummaryViewModel> Games { get; init; } = Array.Empty<GameSummaryViewModel>();
    public IReadOnlyList<GameSummaryViewModel> MyGames { get; init; } = Array.Empty<GameSummaryViewModel>();
    public ProfileSectionViewModel Profile { get; init; } = new();
    public SecuritySectionViewModel Security { get; init; } = new();
    public DashboardStatsViewModel Stats { get; init; } = new();
    public CreateGameFormViewModel NewGame { get; init; } = new();
    public IReadOnlyList<FriendViewModel> Friends { get; init; } = Array.Empty<FriendViewModel>();
}

public record GameSummaryViewModel(Guid Id, string Title, string Slug, string? CoverImagePath, double AverageRating, GameApprovalStatus ApprovalStatus, DateTime CreatedAtUtc, string? ModerationNotes);

public class ProfileSectionViewModel
{
    public string DisplayName { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public DateTime? BirthDate { get; set; }
    public bool IsBirthdayToday { get; set; }
    public string? AvatarUrl { get; set; }
    public string Email { get; set; } = string.Empty;
    public ProfileVisibility DisplayNameVisibility { get; set; } = ProfileVisibility.Everyone;
    public ProfileVisibility FirstNameVisibility { get; set; } = ProfileVisibility.OwnerOnly;
    public ProfileVisibility LastNameVisibility { get; set; } = ProfileVisibility.OwnerOnly;
    public ProfileVisibility BirthDateVisibility { get; set; } = ProfileVisibility.OwnerOnly;
    public ProfileVisibility EmailVisibility { get; set; } = ProfileVisibility.OwnerOnly;
    public ProfileRankViewModel Rank { get; set; } = new();
    public ProfileBestGameViewModel? BestGame { get; set; }
    public IReadOnlyList<ProfileHighlightViewModel> Highlights { get; set; } = Array.Empty<ProfileHighlightViewModel>();
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

    public string DisplayName => string.IsNullOrWhiteSpace(Division) ? Tier : $"{Tier} {Division}";
    public string? NextDisplayName => NextTier is null && NextDivision is null
        ? null
        : string.IsNullOrWhiteSpace(NextDivision)
            ? NextTier
            : $"{NextTier} {NextDivision}";
}

public record ProfileHighlightViewModel(string Title, string Description);

public class ProfileBestGameViewModel
{
    public string Title { get; set; } = string.Empty;
    public double AverageScore { get; set; }
    public DateTime LastPlayedAt { get; set; }
}

public class SecuritySectionViewModel
{
    public string Email { get; set; } = string.Empty;
}

public class DashboardStatsViewModel
{
    public int UploadedGames { get; set; }
    public int TotalScores { get; set; }
    public int TotalReviews { get; set; }
    public int FriendsCount { get; set; }
}

public class CreateGameFormViewModel
{
    [Required, MaxLength(120)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public IFormFile? CoverImage { get; set; }

    [Required, MaxLength(32)]
    public string Version { get; set; } = "1.0.0";

    [Required]
    public IFormFile? Package { get; set; }
}

public class FriendViewModel
{
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public DateTime Since { get; set; }
}

public class UpdateProfileInputModel
{
    [Required, MaxLength(120)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? FirstName { get; set; }

    [MaxLength(100)]
    public string? LastName { get; set; }

    [DataType(DataType.Date)]
    public DateTime? BirthDate { get; set; }

    public ProfileVisibility DisplayNameVisibility { get; set; } = ProfileVisibility.Everyone;
    public ProfileVisibility FirstNameVisibility { get; set; } = ProfileVisibility.OwnerOnly;
    public ProfileVisibility LastNameVisibility { get; set; } = ProfileVisibility.OwnerOnly;
    public ProfileVisibility BirthDateVisibility { get; set; } = ProfileVisibility.OwnerOnly;
    public ProfileVisibility EmailVisibility { get; set; } = ProfileVisibility.OwnerOnly;

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