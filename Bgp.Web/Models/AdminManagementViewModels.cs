using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Web.Models;

public class AdminUsersViewModel
{
    public IReadOnlyList<AdminUserRowViewModel> Users { get; init; } = Array.Empty<AdminUserRowViewModel>();
    public string? Search { get; init; }
    public string? SuccessKey { get; init; }
    public string? ErrorKey { get; init; }
}

public record AdminUserRowViewModel(string Id, string DisplayName, string Email, DateTime CreatedAtUtc, bool IsBlocked, bool IsAdmin);

public class AdminUpdateUserInputModel
{
    [Required]
    public string Id { get; set; } = string.Empty;

    [Required, MaxLength(120)]
    public string DisplayName { get; set; } = string.Empty;

    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
}

public class AdminGamesViewModel
{
    public IReadOnlyList<AdminGameRowViewModel> Games { get; init; } = Array.Empty<AdminGameRowViewModel>();
    public GameApprovalStatus? Filter { get; init; }
    public string? SuccessKey { get; init; }
    public string? ErrorKey { get; init; }
}

public record AdminGameRowViewModel(Guid Id, string Title, string Slug, string Owner, DateTime CreatedAtUtc, GameApprovalStatus Status, string? ModerationNotes);

public class AdminRejectGameInputModel
{
    [Required]
    public Guid Id { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }
}