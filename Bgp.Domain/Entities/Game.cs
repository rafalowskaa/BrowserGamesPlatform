using Bgp.Domain.Abstractions;
using Bgp.Domain.Enums;
using System.ComponentModel.DataAnnotations;

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

    public GameMode Modes { get; set; } = GameMode.None;

    public GameMode ProposedModes { get; set; } = GameMode.Singleplayer;

    public GameCategory Categories { get; set; } = GameCategory.None;

    public GameCategory ProposedCategories { get; set; } = GameCategory.None;

    [MaxLength(256)]
    public string? CoverImagePath { get; set; }

    [Required]
    public string CreatedByUserId { get; set; } = string.Empty;

    public GameApprovalStatus ApprovalStatus { get; set; } = GameApprovalStatus.Pending;

    [MaxLength(500)]
    public string? ModerationNotes { get; set; }

    public DateTime? RejectedAtUtc { get; set; }

    public DateTime? ApprovedAtUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }

    public ICollection<GameVersion> Versions { get; set; } = new List<GameVersion>();
    public ICollection<GameReview> Reviews { get; set; } = new List<GameReview>();
    public ICollection<Score> Scores { get; set; } = new List<Score>();
    public ICollection<GameTag> Tags { get; set; } = new List<GameTag>();
}
