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

public record AdminUserRowViewModel(
    string Id,
    string DisplayName,
    string Email,
    DateTime CreatedAtUtc,
    bool IsBlocked,
    DateTime? BlockedUntilUtc,
    bool IsAdmin);

public record DisplayNameRequestViewModel(string UserId, string CurrentDisplayName, string RequestedDisplayName, DateTime? RequestedAtUtc);

public class AdminUpdateUserInputModel
{
    [Required]
    public string Id { get; set; } = string.Empty;

    [Required, MaxLength(120)]
    public string DisplayName { get; set; } = string.Empty;

    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
}

public class AdminBlockUserInputModel
{
    [Required]
    public string Id { get; set; } = string.Empty;

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

    public List<int> Categories { get; set; } = new();

    public List<int> Modes { get; set; } = new();

    public List<Guid> ApprovedTags { get; set; } = new();
}