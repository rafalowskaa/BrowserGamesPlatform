using System.Linq;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Services;

public interface IChatMessageService
{
    Task<ChatMessagePayload> CreateAsync(string senderId, string receiverId, string content, CancellationToken cancellationToken = default);
}

public record ChatMessagePayload(
    Guid Id,
    string SenderId,
    string ReceiverId,
    string SenderName,
    string ReceiverName,
    string Content,
    DateTime SentAtUtc,
    bool IsRead,
    DateTime? ReadAtUtc,
    bool IsDeleted,
    DateTime? DeletedAtUtc);

public class ChatMessageService : IChatMessageService
{
    private readonly AppDbContext _db;

    public ChatMessageService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<ChatMessagePayload> CreateAsync(string senderId, string receiverId, string content, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(senderId))
        {
            throw new ArgumentException("Sender is required.", nameof(senderId));
        }

        if (string.IsNullOrWhiteSpace(receiverId))
        {
            throw new ArgumentException("Receiver is required.", nameof(receiverId));
        }

        var trimmed = content?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            throw new InvalidOperationException("Message content cannot be empty.");
        }

        var blocked = await _db.Friendships.AnyAsync(f =>
            (f.RequesterId == senderId && f.AddresseeId == receiverId ||
             f.RequesterId == receiverId && f.AddresseeId == senderId) &&
            f.Status == FriendshipStatus.Blocked,
            cancellationToken);

        if (blocked)
        {
            throw new InvalidOperationException("User is blocked.");
        }

        var message = new Bgp.Domain.Entities.ChatMessage
        {
            SenderId = senderId,
            ReceiverId = receiverId,
            Content = trimmed,
            SentAtUtc = DateTime.UtcNow
        };

        _db.ChatMessages.Add(message);
        await _db.SaveChangesAsync(cancellationToken);

        var participants = await _db.Users
            .Where(u => u.Id == senderId || u.Id == receiverId)
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
            .ToListAsync(cancellationToken);

        var sender = participants.FirstOrDefault(u => u.Id == senderId);
        var receiver = participants.FirstOrDefault(u => u.Id == receiverId);

        var senderName = DisplayNameFormatter.Format(sender?.DisplayName, sender?.Email, sender?.UserName, sender?.Id);
        if (string.IsNullOrWhiteSpace(senderName))
        {
            senderName = sender?.UserName?.ToUpperInvariant() ?? senderId.ToUpperInvariant();
        }

        var receiverName = DisplayNameFormatter.Format(receiver?.DisplayName, receiver?.Email, receiver?.UserName, receiver?.Id);
        if (string.IsNullOrWhiteSpace(receiverName))
        {
            receiverName = string.Empty;
        }

        return new ChatMessagePayload(
            message.Id,
            senderId,
            receiverId,
            senderName,
            receiverName,
            message.Content,
            message.SentAtUtc,
            message.IsRead,
            message.ReadAtUtc,
            message.IsDeleted,
            message.DeletedAtUtc);
    }
}