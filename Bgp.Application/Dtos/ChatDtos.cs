namespace Bgp.Application.Dtos;

public record ChatMessageDto(
    Guid Id,
    string SenderId,
    string ReceiverId,
    string SenderName,
    string ReceiverName,
    string Content,
    string? AttachmentUrl,
    string? AttachmentName,
    string? Reaction,
    DateTime SentAtUtc,
    bool FromSelf,
    bool IsRead,
    DateTime? ReadAtUtc,
    bool IsDeleted,
    DateTime? DeletedAtUtc);

public class SendMessageRequest
{
    public string ToUserId { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
}
