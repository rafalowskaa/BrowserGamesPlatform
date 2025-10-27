using System.Collections.Concurrent;
using System.Security.Claims;
using System.Linq;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Bgp.Web.Helpers;
using Microsoft.EntityFrameworkCore;
using Bgp.Web.Services;
using Bgp.Domain.Enums;

namespace Bgp.Web.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private readonly AppDbContext _db;
    private readonly IPresenceNotifier _presenceNotifier;
    private static readonly ConcurrentDictionary<string, int> ConnectionCounts = new();

    public ChatHub(AppDbContext db, IPresenceNotifier presenceNotifier)
    {
        _db = db;
        _presenceNotifier = presenceNotifier;
    }

    private string? UserId => Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

    public override async Task OnConnectedAsync()
    {
        if (UserId is not null)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user-{UserId}");
            var count = ConnectionCounts.AddOrUpdate(UserId, 1, (_, current) => current + 1);
            if (count == 1)
            {
                await BroadcastPresenceAsync(UserId);
            }
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (UserId is not null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user-{UserId}");
            var remaining = ConnectionCounts.AddOrUpdate(UserId, 0, (_, current) => Math.Max(current - 1, 0));
            if (remaining <= 0)
            {
                ConnectionCounts.TryRemove(UserId, out _);
                await SetOfflineAsync(UserId);
            }
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task SendPrivateMessage(string toUserId, string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return;
        if (UserId is null) throw new HubException("Unauthorized");

        // prosta kontrola blokady: jeśli którykolwiek zablokował – przerwij
        var blocked = await _db.Friendships.AnyAsync(f =>
            (f.RequesterId == UserId && f.AddresseeId == toUserId || f.RequesterId == toUserId && f.AddresseeId == UserId)
            && f.Status == FriendshipStatus.Blocked);
        if (blocked) throw new HubException("User is blocked.");

        var m = new Bgp.Domain.Entities.ChatMessage
        {
            SenderId = UserId,
            ReceiverId = toUserId,
            Content = message.Trim(),
            SentAtUtc = DateTime.UtcNow
        };
        _db.ChatMessages.Add(m);
        await _db.SaveChangesAsync();

        var sender = await _db.Users.FindAsync(UserId);
        var receiver = await _db.Users.FindAsync(toUserId);

        var senderName = DisplayNameFormatter.Format(sender);
        if (string.IsNullOrWhiteSpace(senderName))
        {
            senderName = "Me";
        }

        var receiverName = DisplayNameFormatter.Format(receiver);


        var dto = new
        {
            id = m.Id,
            senderId = m.SenderId,
            receiverId = m.ReceiverId,
            senderName,
            receiverName = string.IsNullOrWhiteSpace(receiverName) ? string.Empty : receiverName,
            content = m.Content,
            sentAtUtc = m.SentAtUtc,
            isRead = m.IsRead,
            readAtUtc = m.ReadAtUtc
        };

        // Wyślij do obu stron (grupy per użytkownik)
        await Clients.Group($"user-{toUserId}").SendAsync("ReceiveMessage", dto);
        await Clients.Group($"user-{UserId}").SendAsync("ReceiveMessage", dto);
    }

    public async Task MarkThreadRead(string otherUserId)
    {
        if (UserId is null)
        {
            throw new HubException("Unauthorized");
        }

        var unread = await _db.ChatMessages
            .Where(m => m.SenderId == otherUserId && m.ReceiverId == UserId && !m.IsRead)
            .ToListAsync();

        if (unread.Count == 0)
        {
            return;
        }

        var now = DateTime.UtcNow;

        foreach (var message in unread)
        {
            message.IsRead = true;
            message.ReadAtUtc = now;
        }

        await _db.SaveChangesAsync();

        var payload = new
        {
            userId = UserId,
            peerId = otherUserId,
            messageIds = unread.Select(m => m.Id).ToArray(),
            readAtUtc = now
        };

        await Clients.Group($"user-{otherUserId}").SendAsync("MessagesRead", payload);
        await Clients.Group($"user-{UserId}").SendAsync("MessagesRead", payload);
    }

    private async Task BroadcastPresenceAsync(string userId)
    {
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null)
        {
            return;
        }

        await _presenceNotifier.BroadcastAsync(user.Id, user.StatusMessage, user.PresenceStatus, user.IsInvisible);
    }

    private async Task SetOfflineAsync(string userId)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user is null)
        {
            return;
        }

        if (user.PresenceStatus != UserPresenceStatus.Offline)
        {
            user.PresenceStatus = UserPresenceStatus.Offline;
        }

        await _db.SaveChangesAsync();
        await _presenceNotifier.BroadcastAsync(user.Id, user.StatusMessage, user.PresenceStatus, user.IsInvisible);
    }
}
