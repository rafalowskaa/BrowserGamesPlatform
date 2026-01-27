using System.Security.Claims;
using Bgp.Domain.Enums;
using Bgp.Domain.Entities;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;
using Bgp.Web.Resources;
using Bgp.Web.Helpers;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IStringLocalizer<SharedResource> _localizer;

    public NotificationsController(AppDbContext db, IStringLocalizer<SharedResource> localizer)
    {
        _db = db;
        _localizer = localizer;
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
            ActivityLogType.RatingSubmitted,
            ActivityLogType.NewEventAvailable
        };

        var query = _db.ActivityLogs
            .AsNoTracking()
            .Where(l => notificationTypes.Contains(l.Type)
                        && (l.TargetUserId == userId
                            || (l.ActorUserId != null && friendIds.Contains(l.ActorUserId)))
                        && !_db.NotificationDismissals.Any(d => d.UserId == userId && d.ActivityLogId == l.Id));

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
    [HttpGet("latest")]
    public async Task<ActionResult<object>> GetLatest([FromQuery] DateTime? since, [FromQuery] int limit = 5)
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
            ActivityLogType.RatingSubmitted,
            ActivityLogType.NewEventAvailable
        };

        var query = _db.ActivityLogs
            .AsNoTracking()
            .Where(l => notificationTypes.Contains(l.Type)
                        && (l.TargetUserId == userId
                            || (l.ActorUserId != null && friendIds.Contains(l.ActorUserId)))
                        && !_db.NotificationDismissals.Any(d => d.UserId == userId && d.ActivityLogId == l.Id));

        if (since.HasValue)
        {
            var sinceUtc = since.Value.Kind == DateTimeKind.Utc ? since.Value : since.Value.ToUniversalTime();
            query = query.Where(l => l.CreatedAtUtc > sinceUtc);
        }

        var logs = await query
            .OrderByDescending(l => l.CreatedAtUtc)
            .Take(Math.Clamp(limit, 1, 20))
            .ToListAsync();

        if (logs.Count == 0)
        {
            return Ok(new { items = Array.Empty<object>() });
        }

        var actorIds = logs
            .Select(l => l.ActorUserId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();

        var actorLookup = actorIds.Count == 0
            ? new Dictionary<string, string>()
            : await _db.Users
                .AsNoTracking()
                .Where(u => actorIds.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
                .ToDictionaryAsync(u => u.Id, u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id));

        var gameIds = logs
            .Where(l => l.GameId.HasValue)
            .Select(l => l.GameId!.Value)
            .Distinct()
            .ToList();

        var gameLookup = gameIds.Count == 0
            ? new Dictionary<Guid, (string Title, string Slug)>()
            : await _db.Games
                .AsNoTracking()
                .Where(g => gameIds.Contains(g.Id))
                .Select(g => new { g.Id, g.Title, g.Slug })
                .ToDictionaryAsync(g => g.Id, g => (g.Title, g.Slug));

        string Localize(string key) => _localizer[key].Value;

        string BuildMessage(ActivityLog log)
        {
            var actorName = log.ActorUserId != null && actorLookup.TryGetValue(log.ActorUserId, out var name)
                ? name
                : Localize("Dashboard_Friends_Unknown");
            var gameTitle = log.GameId.HasValue && gameLookup.TryGetValue(log.GameId.Value, out var game)
                  ? game.Title
                  : string.Empty;

            return log.Type switch
            {
                ActivityLogType.FriendRequestSent => string.Format(Localize("Dashboard_Notifications_FriendRequest"), actorName),
                ActivityLogType.FriendRequestAccepted => string.Format(Localize("Dashboard_Notifications_FriendAccepted"), actorName),
                ActivityLogType.GameInviteSent => string.Format(Localize("Dashboard_Notifications_GameInvite"), actorName, gameTitle),
                ActivityLogType.GameInviteAccepted => string.Format(Localize("Dashboard_Notifications_GameInviteAccepted"), actorName, gameTitle),
                ActivityLogType.CommentAdded when log.TargetUserId == userId
                    => string.Format(Localize("Dashboard_Notifications_CommentQuote"), actorName, gameTitle),
                ActivityLogType.CommentAdded => string.Format(Localize("Dashboard_Notifications_CommentAdded"), actorName, gameTitle),
                ActivityLogType.CommentLiked => string.Format(Localize("Dashboard_Notifications_CommentLiked"), actorName, gameTitle),
                ActivityLogType.CommentDisliked => string.Format(Localize("Dashboard_Notifications_CommentDisliked"), actorName, gameTitle),
                ActivityLogType.RatingSubmitted => string.Format(Localize("Dashboard_Notifications_Rating"), actorName, gameTitle),
                ActivityLogType.NewEventAvailable => string.Format(Localize("Dashboard_Notifications_Event"), log.Message ?? Localize("Dashboard_Notifications_Event_Default")),
                _ => string.Format(Localize("Dashboard_Notifications_Generic"), actorName)
            };
        }

        string? BuildLink(ActivityLog log)
        {
            if (log.Type is ActivityLogType.FriendRequestSent or ActivityLogType.FriendRequestAccepted)
            {
                return Url.Action("Index", "Dashboard", new { tab = "friends" });
            }

            if (log.Type is ActivityLogType.GameInviteSent or ActivityLogType.GameInviteAccepted)
            {
                if (log.GameId.HasValue && gameLookup.TryGetValue(log.GameId.Value, out var game))
                {
                    return Url.Action("Details", "Games", new { slug = game.Slug, tab = "play" });
                }
                return Url.Action("Index", "Dashboard", new { tab = "overview" });
            }

            if (log.Type is ActivityLogType.CommentAdded or ActivityLogType.CommentLiked or ActivityLogType.CommentDisliked or ActivityLogType.RatingSubmitted)
            {
                if (log.GameId.HasValue && gameLookup.TryGetValue(log.GameId.Value, out var game))
                {
                    return Url.Action("Details", "Games", new { slug = game.Slug, tab = "reviews" });
                }
            }

            if (log.Type is ActivityLogType.NewEventAvailable)
            {
                return Url.Action("Index", "Home");
            }

            return null;
        }

        var items = logs
            .OrderByDescending(l => l.CreatedAtUtc)
            .Select(log => new
            {
                id = log.Id,
                message = BuildMessage(log),
                link = BuildLink(log),
                created_at = log.CreatedAtUtc
            })
            .ToList();

        return Ok(new { items });
    }
}