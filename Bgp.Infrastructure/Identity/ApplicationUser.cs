using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;
using Bgp.Domain.Enums;

namespace Bgp.Infrastructure.Identity;

public class ApplicationUser : IdentityUser
{
    public string? DisplayName { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;


    [MaxLength(512)]
    public string? AvatarUrl { get; set; }

    public bool IsBlocked { get; set; }
    public DateTime? BlockedUntilUtc { get; set; }

    [MaxLength(250)]
    public string? BlockReason { get; set; }

    public DateTime? BirthDate { get; set; }

    public int? BirthMonth { get; set; }

    public int? BirthDay { get; set; }

    public int? BirthYear { get; set; }

    [MaxLength(120)]
    public string? PendingDisplayName { get; set; }

    public DateTime? PendingDisplayNameRequestedAtUtc { get; set; }

    public DateTime? DisplayNameLastApprovedAtUtc { get; set; }

    public ProfileVisibility DisplayNameVisibility { get; set; } = ProfileVisibility.Everyone;

    public ProfileVisibility BirthDateVisibility { get; set; } = ProfileVisibility.OwnerOnly;

    public ProfileVisibility EmailVisibility { get; set; } = ProfileVisibility.OwnerOnly;

    [MaxLength(160)]
    public string? StatusMessage { get; set; }

    public UserPresenceStatus PresenceStatus { get; set; } = UserPresenceStatus.Offline;

    public bool IsInvisible { get; set; }

    [MaxLength(10)]
    public string PreferredLanguage { get; set; } = "system";

    [MaxLength(20)]
    public string PreferredTheme { get; set; } = "system";

    public bool EnableEmailNotifications { get; set; } = true;

    public bool EnableFriendInvites { get; set; } = true;

    [MaxLength(128)]
    public string? SecurityQuestion1Key { get; set; }

    [MaxLength(256)]
    public string? SecurityQuestion1CustomPrompt { get; set; }

    [MaxLength(512)]
    public string? SecurityQuestion1AnswerHash { get; set; }

    [MaxLength(128)]
    public string? SecurityQuestion2Key { get; set; }

    [MaxLength(256)]
    public string? SecurityQuestion2CustomPrompt { get; set; }

    [MaxLength(512)]
    public string? SecurityQuestion2AnswerHash { get; set; }

    [MaxLength(128)]
    public string? SecurityQuestion3Key { get; set; }

    [MaxLength(256)]
    public string? SecurityQuestion3CustomPrompt { get; set; }

    [MaxLength(512)]
    public string? SecurityQuestion3AnswerHash { get; set; }
}
