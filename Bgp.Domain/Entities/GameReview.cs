using System.ComponentModel.DataAnnotations;

namespace Bgp.Domain.Entities;

public class GameReview
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid GameId { get; set; }
    public Game Game { get; set; } = default!;

    [Required]
    public string UserId { get; set; } = string.Empty;

    [Range(1, 5)]
    public int Stars { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
