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

    [Range(0, 5)]
    public int Stars { get; set; }

    public bool IsRating { get; set; } = true;

    [MaxLength(2000)]
    public string? Comment { get; set; }

    public Guid? ReplyToReviewId { get; set; }
    public GameReview? ReplyTo { get; set; }

    public ICollection<GameCommentReaction> Reactions { get; set; } = new List<GameCommentReaction>();

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
