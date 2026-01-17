using System.ComponentModel.DataAnnotations;

namespace Bgp.Domain.Entities;

public class SessionPlayer
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid SessionId { get; set; }

    [Required, MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    [Required, MaxLength(128)]
    public string TokenHash { get; set; } = string.Empty;

    [MaxLength(24)]
    public string Role { get; set; } = "player";

    public DateTime JoinedAtUtc { get; set; } = DateTime.UtcNow;
}