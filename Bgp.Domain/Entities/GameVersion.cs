using System.ComponentModel.DataAnnotations;

namespace Bgp.Domain.Entities;

public class GameVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid GameId { get; set; }
    public Game Game { get; set; } = default!;

    [Required, MaxLength(32)]
    public string Version { get; set; } = "1.0.0";

    // Ścieżka do rozpakowanych plików gry w wwwroot/games/{slug}/{version}/
    [Required, MaxLength(512)]
    public string ContentPath { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Changelog { get; set; }

    public DateTime PublishedAtUtc { get; set; } = DateTime.UtcNow;
}
