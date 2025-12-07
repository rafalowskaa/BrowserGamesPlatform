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
    private readonly IChatMessageService _chatMessages;
    private static readonly ConcurrentDictionary<string, int> ConnectionCounts = new();

    public ChatHub(AppDbContext db, IPresenceNotifier presenceNotifier, IChatMessageService chatMessages)
    {
        _db = db;
        _presenceNotifier = presenceNotifier;
        _chatMessages = chatMessages;
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

    public async Task SendPrivateMessage(string toUserId, string message, string? attachmentUrl = null, string? attachmentName = null)
    {
        if (string.IsNullOrWhiteSpace(message) && string.IsNullOrWhiteSpace(attachmentUrl))
            return;
        if (UserId is null) throw new HubException("Unauthorized");

        try
        {
            var payload = await _chatMessages.CreateAsync(UserId, toUserId, message, attachmentUrl, attachmentName, Context.ConnectionAborted);

            await Clients.Group($"user-{toUserId}").SendAsync("ReceiveMessage", payload);
            await Clients.Group($"user-{UserId}").SendAsync("ReceiveMessage", payload);
        }

        catch (InvalidOperationException ex)
        
        {
            throw new HubException(ex.Message);
        }
    }

    public async Task MarkThreadRead(string otherUserId)
    {
        if (UserId is null)
        {
            throw new HubException("Unauthorized");
        }

        var unread = await _db.ChatMessages
            .Where(m => m.SenderId == otherUserId && m.ReceiverId == UserId && !m.IsRead && !m.IsDeleted)
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
