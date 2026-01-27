using System.ComponentModel.DataAnnotations;

namespace Bgp.Domain.Entities;

public class AdminLogDismissal
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ActivityLogId { get; set; }

    public string? DeletedByUserId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}