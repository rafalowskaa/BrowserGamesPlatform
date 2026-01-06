using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Bgp.Web.Hubs;

[Authorize]
public class InvitesHub : Hub
{
    private string? UserId => Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

    public override async Task OnConnectedAsync()
    {
        if (!string.IsNullOrEmpty(UserId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user-{UserId}");
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (!string.IsNullOrEmpty(UserId))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user-{UserId}");
        }
        await base.OnDisconnectedAsync(exception);
    }
}