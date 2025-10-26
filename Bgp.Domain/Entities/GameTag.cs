using System.ComponentModel.DataAnnotations;

namespace Bgp.Domain.Entities;

public class GameTag
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(40)]
    public string Value { get; set; } = string.Empty;

    public Guid GameId { get; set; }

    public Game? Game { get; set; }

    public bool IsApproved { get; set; }

    [Required]
    public string AddedByUserId { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? ReviewedAtUtc { get; set; }
}