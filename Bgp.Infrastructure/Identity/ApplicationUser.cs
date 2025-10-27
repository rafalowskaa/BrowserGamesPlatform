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

    public int? BirthMonth { get; set; }

    public int? BirthDay { get; set; }

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
}
