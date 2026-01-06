using System.ComponentModel.DataAnnotations;

namespace Bgp.Domain.Entities;

public class GameLocale
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid GameId { get; set; }
    public Game Game { get; set; } = default!;

    [Required, MaxLength(10)]
    public string Locale { get; set; } = "en-US";

    [Required, MaxLength(160)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public string? RulesContent { get; set; }

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}