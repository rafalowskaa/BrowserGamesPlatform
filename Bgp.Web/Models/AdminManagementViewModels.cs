using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Web.Models;

public class AdminUsersViewModel
{
    public IReadOnlyList<AdminUserRowViewModel> Users { get; init; } = Array.Empty<AdminUserRowViewModel>();
    public string? Search { get; init; }
    public string? SuccessKey { get; init; }
    public string? ErrorKey { get; init; }
    public IReadOnlyList<DisplayNameRequestViewModel> DisplayNameRequests { get; init; } = Array.Empty<DisplayNameRequestViewModel>();
}

public enum AdminUserAccessLevel
{
    User,
    Moderator,
    Admin
}

public record AdminUserRowViewModel(
    string Id,
    string DisplayName,
    string Email,
    DateTime CreatedAtUtc,
    bool IsBlocked,
    DateTime? BlockedUntilUtc,
    string? BlockReason,
    AdminUserAccessLevel AccessLevel);

public record DisplayNameRequestViewModel(string UserId, string CurrentDisplayName, string RequestedDisplayName, DateTime? RequestedAtUtc);

public class AdminUpdateUserInputModel
{
    [Required]
    public string Id { get; set; } = string.Empty;

    [Required, MaxLength(120)]
    public string DisplayName { get; set; } = string.Empty;

    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;


    [Required]
    public AdminUserAccessLevel AccessLevel { get; set; } = AdminUserAccessLevel.User;
}

public class AdminBlockUserInputModel
{
    [Required]
    public string Id { get; set; } = string.Empty;

    [Required, MaxLength(250)]
    public string Reason { get; set; } = string.Empty;

    public DateTime? BlockedUntil { get; set; }
}

public class AdminGamesViewModel
{
    public IReadOnlyList<AdminGameRowViewModel> Games { get; init; } = Array.Empty<AdminGameRowViewModel>();
    public GameApprovalStatus? Filter { get; init; }
    public string? SuccessKey { get; init; }
    public string? ErrorKey { get; init; }
}

public record AdminGameRowViewModel(
    Guid Id,
    string Title,
    string Slug,
    string Owner,
    DateTime CreatedAtUtc,
    GameApprovalStatus Status,
    string? ModerationNotes,
    GameCategory ProposedCategories,
    GameCategory Categories,
    GameMode ProposedModes,
    GameMode Modes,
    string? Description,
    string? CoverImagePath,
    IReadOnlyList<AdminGameTagViewModel> Tags);

public record AdminGameTagViewModel(Guid Id, string Value, bool IsApproved, bool IsPending);

public class AdminRejectGameInputModel
{
    [Required]
    public Guid Id { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

}

public class AdminUpdateGameMetadataInputModel
{
    [Required]
    public Guid Id { get; set; }

    [Required, MaxLength(120)]
    public string Title { get; set; } = string.Empty;

    [Required, MaxLength(140)]
    public string Slug { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    [MaxLength(256)]
    public string? CoverImagePath { get; set; }

    public List<int> Categories { get; set; } = new();

    public List<int> Modes { get; set; } = new();

    public List<Guid> ApprovedTags { get; set; } = new();
}
public class AdminHomeContentViewModel
{
    public IReadOnlyList<AdminHomeFactViewModel> Facts { get; init; } = Array.Empty<AdminHomeFactViewModel>();
    public IReadOnlyList<AdminHomeEventViewModel> Events { get; init; } = Array.Empty<AdminHomeEventViewModel>();
    public AdminHomeFeaturedGameViewModel? FeaturedGame { get; init; }
    public string? SuccessKey { get; init; }
    public string? ErrorKey { get; init; }
}

public record AdminHomeFactViewModel(int Id, string Content, bool IsActive, int SortOrder, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);

public record AdminHomeEventViewModel(int Id, string Title, string Reward, DateTime EndsAtUtc, bool IsActive, int SortOrder, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);

public record AdminHomeFeaturedGameViewModel(
    int Id,
    Guid GameId,
    string GameTitle,
    string GameSlug,
    string? CoverImagePath,
    string? Description,
    DateTime StartsAtUtc,
    DateTime EndsAtUtc,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc);

public class AdminUpsertHomeFactInputModel
{
    public int? Id { get; set; }

    [Required, MaxLength(280)]
    public string Content { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }
}

public class AdminDeleteHomeFactInputModel
{
    [Required]
    public int Id { get; set; }
}

public class AdminUpsertHomeEventInputModel
{
    public int? Id { get; set; }

    [Required, MaxLength(160)]
    public string Title { get; set; } = string.Empty;

    [Required, MaxLength(160)]
    public string Reward { get; set; } = string.Empty;

    [Required]
    public DateTime EndsAt { get; set; } = DateTime.UtcNow;

    public bool IsActive { get; set; } = true;

    public int SortOrder { get; set; }
}

public class AdminUpsertHomeFeaturedGameInputModel
{
    public int? Id { get; set; }

    [Required]
    public Guid GameId { get; set; }

    [MaxLength(600)]
    public string? Description { get; set; }

    [Required]
    public DateTime StartsAt { get; set; } = DateTime.UtcNow;

    [Required]
    public DateTime EndsAt { get; set; } = DateTime.UtcNow.AddDays(3);

    public bool IsActive { get; set; } = true;
}

public class AdminDeleteHomeFeaturedGameInputModel
{
    [Required]
    public int Id { get; set; }
}

public class AdminDeleteGameInputModel
{
    [Required]
    public Guid Id { get; set; }
}

public class AdminDeleteHomeEventInputModel
{
    [Required]
    public int Id { get; set; }
}