using System.Security.Claims;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly AppDbContext _db;

    public NotificationsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("unread-count")]
    public async Task<ActionResult<object>> GetUnreadCount([FromQuery] DateTime? since)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var friendIds = await _db.Friendships
            .Where(f => (f.RequesterId == userId || f.AddresseeId == userId)
                        && f.Status == FriendshipStatus.Accepted)
            .Select(f => f.RequesterId == userId ? f.AddresseeId : f.RequesterId)
            .Distinct()
            .ToListAsync();

        var notificationTypes = new[]
        {
            ActivityLogType.FriendRequestSent,
            ActivityLogType.FriendRequestAccepted,
            ActivityLogType.GameInviteSent,
            ActivityLogType.GameInviteAccepted,
            ActivityLogType.CommentAdded,
            ActivityLogType.CommentLiked,
            ActivityLogType.CommentDisliked,
            ActivityLogType.RatingSubmitted
        };

        var query = _db.ActivityLogs
            .AsNoTracking()
            .Where(l => notificationTypes.Contains(l.Type)
                        && (l.TargetUserId == userId
                            || (l.ActorUserId != null && friendIds.Contains(l.ActorUserId))));

        if (since.HasValue)
        {
            var sinceUtc = since.Value.Kind == DateTimeKind.Utc ? since.Value : since.Value.ToUniversalTime();
            query = query.Where(l => l.CreatedAtUtc > sinceUtc);
        }

        var count = await query.CountAsync();
        var latest = await query.OrderByDescending(l => l.CreatedAtUtc)
            .Select(l => (DateTime?)l.CreatedAtUtc)
            .FirstOrDefaultAsync();

        return Ok(new
        {
            count,
            latest
        });
    }
}