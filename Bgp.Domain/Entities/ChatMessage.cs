using System.ComponentModel.DataAnnotations;

namespace Bgp.Domain.Entities;

public class ChatMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required] public string SenderId { get; set; } = string.Empty;
    [Required] public string ReceiverId { get; set; } = string.Empty;

    [Required, MaxLength(2000)]
    public string Content { get; set; } = string.Empty;

    public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;
    public bool IsRead { get; set; }
    public DateTime? ReadAtUtc { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAtUtc { get; set; }
    [MaxLength(450)]
    public string? DeletedById { get; set; }
}
