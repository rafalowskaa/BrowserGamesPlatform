using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Domain.Entities;

public class Friendship
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // Kto wysłał zaproszenie
    [Required] public string RequesterId { get; set; } = string.Empty;

    // Do kogo
    [Required] public string AddresseeId { get; set; } = string.Empty;

    public FriendshipStatus Status { get; set; } = FriendshipStatus.Pending;

    // Jeśli Status == Blocked, wskazuje kto zablokował
    [MaxLength(64)] public string? BlockedByUserId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }
}
