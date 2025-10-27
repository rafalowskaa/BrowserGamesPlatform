using System.Linq;
using System.Threading.Tasks;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Services;

public interface IPresenceNotifier
{
    Task BroadcastAsync(string userId, string? statusMessage, UserPresenceStatus presence, bool isInvisible);
}

public class PresenceNotifier : IPresenceNotifier
{
    private readonly AppDbContext _db;
    private readonly IHubContext<ChatHub> _hub;

    public PresenceNotifier(AppDbContext db, IHubContext<ChatHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    public async Task BroadcastAsync(string userId, string? statusMessage, UserPresenceStatus presence, bool isInvisible)
    {
        var friendIds = await _db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == userId || f.AddresseeId == userId))
            .Select(f => f.RequesterId == userId ? f.AddresseeId : f.RequesterId)
            .Distinct()
            .ToListAsync();

        var payload = new
        {
            userId,
            statusMessage,
            presence = (int)presence,
            isInvisible
        };

        var recipients = friendIds.Append(userId).Distinct();
        foreach (var target in recipients)
        {
            await _hub.Clients.Group($"user-{target}").SendAsync("PresenceUpdated", payload);
        }
    }
}