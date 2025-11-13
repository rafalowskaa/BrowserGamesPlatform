using System;

namespace Bgp.Domain.Entities;

public class HomeFeaturedGame
{
    public int Id { get; set; }
    public Guid GameId { get; set; }
    public string? CustomDescription { get; set; }
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }
    public Game? Game { get; set; }
}