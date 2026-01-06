using System;
using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Domain.Entities;

public class ActivityLog
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public ActivityLogType Type { get; set; }

    [MaxLength(450)]
    public string? ActorUserId { get; set; }

    [MaxLength(450)]
    public string? TargetUserId { get; set; }

    public Guid? GameId { get; set; }

    public Guid? CommentId { get; set; }

    public Guid? InviteId { get; set; }

    [MaxLength(256)]
    public string? GameSlug { get; set; }

    public int? Rating { get; set; }

    [MaxLength(2000)]
    public string? Message { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}