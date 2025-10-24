using System.ComponentModel.DataAnnotations;

namespace Bgp.Domain.Entities;

public class MatchSession
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid GameId { get; set; }

    [Required]
    public string UserId { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow.AddMinutes(10);

    // Krótkotrwały klucz HMAC do podpisywania wyniku (przechowywany jawnie ~10 min)
    [Required, MaxLength(128)]
    public string EphemeralKey { get; set; } = string.Empty;

    public bool Used { get; set; } = false;
}
