using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Domain.Entities;

public class MatchSession
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid GameId { get; set; }

    [Required]
    public string UserId { get; set; } = string.Empty;

    public GameMode Mode { get; set; } = GameMode.Singleplayer;

    [MaxLength(256)]
    public string? WsUrl { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow.AddMinutes(10);

    [Required, MaxLength(128)]
    public string Token { get; set; } = string.Empty;

    public bool Used { get; set; } = false;
}
