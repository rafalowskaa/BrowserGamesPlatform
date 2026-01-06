using System;
using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Domain.Entities;

public class GameCommentReaction
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ReviewId { get; set; }
    public GameReview Review { get; set; } = default!;

    [Required]
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    [Required]
    public CommentReactionType Reaction { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}