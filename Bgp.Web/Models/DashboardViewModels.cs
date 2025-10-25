using System;
using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;
using Microsoft.AspNetCore.Http;

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
    public string? AvatarUrl { get; set; }
    public string Email { get; set; } = string.Empty;
    public string RankName { get; set; } = string.Empty;
    public int RankLevel { get; set; }
    public int ExperiencePoints { get; set; }
    public int ExperienceToNextLevel { get; set; }
    public int CurrentLevelThreshold { get; set; }
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