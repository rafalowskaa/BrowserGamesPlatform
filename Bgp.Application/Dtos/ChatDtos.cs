namespace Bgp.Application.Dtos;

public record ChatMessageDto(
    Guid Id,
    string SenderId,
    string ReceiverId,
    string SenderName,
    string ReceiverName,
    string Content,
    DateTime SentAtUtc,
    bool FromSelf,
    bool IsRead,
    DateTime? ReadAtUtc);

public class SendMessageRequest
{
    public string ToUserId { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}
