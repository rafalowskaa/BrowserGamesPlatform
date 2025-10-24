using Bgp.Domain.Abstractions;
using Bgp.Domain.Enums;
using System.ComponentModel.DataAnnotations;
using static System.Formats.Asn1.AsnWriter;

namespace Bgp.Domain.Entities;

public class Game : IAggregateRoot
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(120)]
    public string Title { get; set; } = string.Empty;

    [Required, MaxLength(140)]
    public string Slug { get; set; } = string.Empty; // unikalny

    [MaxLength(2000)]
    public string? Description { get; set; }

    public GameMode Modes { get; set; } = GameMode.Singleplayer;

    [MaxLength(256)]
    public string? CoverImagePath { get; set; }

    [Required]
    public string CreatedByUserId { get; set; } = string.Empty;

    public bool IsPublished { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }

    public ICollection<GameVersion> Versions { get; set; } = new List<GameVersion>();
    public ICollection<GameReview> Reviews { get; set; } = new List<GameReview>();
    public ICollection<Score> Scores { get; set; } = new List<Score>();
}
