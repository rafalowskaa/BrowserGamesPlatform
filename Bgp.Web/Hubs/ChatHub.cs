using System.Security.Claims;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Bgp.Web.Helpers;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private readonly AppDbContext _db;
    public ChatHub(AppDbContext db) => _db = db;

    private string? UserId => Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

    public override async Task OnConnectedAsync()
    {
        if (UserId is not null)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user-{UserId}");
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (UserId is not null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user-{UserId}");
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
            && f.Status == Domain.Enums.FriendshipStatus.Blocked);
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
            sentAtUtc = m.SentAtUtc
        };

        // Wyślij do obu stron (grupy per użytkownik)
        await Clients.Group($"user-{toUserId}").SendAsync("ReceiveMessage", dto);
        await Clients.Group($"user-{UserId}").SendAsync("ReceiveMessage", dto);
    }
}
