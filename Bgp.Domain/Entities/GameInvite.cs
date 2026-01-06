using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Domain.Entities;

public class GameInvite
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid SessionId { get; set; }

    [Required, MaxLength(450)]
    public string FromUserId { get; set; } = string.Empty;

    [Required, MaxLength(450)]
    public string ToUserId { get; set; } = string.Empty;

    public GameInviteStatus Status { get; set; } = GameInviteStatus.Pending;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? RespondedAtUtc { get; set; }

    [MaxLength(64)]
    public string? Mode { get; set; }
}