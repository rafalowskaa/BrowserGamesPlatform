using System;

namespace Bgp.Domain.Entities;

public class HomeEvent
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Reward { get; set; } = string.Empty;
    public DateTime StartsAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime EndsAtUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public Guid? GameId { get; set; }
    public Game? Game { get; set; }
    public string? ImagePath { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }
}
