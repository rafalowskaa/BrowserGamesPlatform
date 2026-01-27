using System.ComponentModel.DataAnnotations;

namespace Bgp.Domain.Entities;

public class NotificationDismissal
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public string UserId { get; set; } = string.Empty;

    [Required]
    public Guid ActivityLogId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}