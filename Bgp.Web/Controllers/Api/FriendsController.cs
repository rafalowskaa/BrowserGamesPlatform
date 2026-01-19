using System;
using System.Collections.Generic;
using System.Linq;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Bgp.Application.Dtos;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bgp.Web.Helpers;
using Bgp.Web.Hubs;
using Bgp.Web.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Bgp.Web.Models;
using Microsoft.Extensions.Localization;
using Bgp.Web.Resources;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/friends")]
[Authorize]
public class FriendsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IStringLocalizer<SharedResource> _localizer;
    private readonly IHubContext<ChatHub> _hub;
    private readonly IActivityLogger _logger;
    public FriendsController(AppDbContext db, IStringLocalizer<SharedResource> localizer, IHubContext<ChatHub> hub, IActivityLogger logger)
    {
        _db = db;
        _localizer = localizer;
        _hub = hub;
        _logger = logger;
    }

    private string? UserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub)
        ?? User.FindFirstValue(ClaimTypes.Name);
    private readonly record struct RankSnapshot(string? Title, string AccentColor);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<FriendDto>>> Get()
    {
        var uid = UserId;
        if (string.IsNullOrWhiteSpace(uid))
        {
            return Unauthorized();
        }

        var accepted = await _db.Friendships
            .Where(f => (f.RequesterId == uid || f.AddresseeId == uid) && f.Status == FriendshipStatus.Accepted)
            .Select(f => new { f.RequesterId, f.AddresseeId })
            .ToListAsync();

        var friendIds = accepted
            .Select(a => a.RequesterId == uid ? a.AddresseeId : a.RequesterId)
            .Distinct()
            .ToList();

        var outgoing = await _db.Friendships
            .Where(f => f.RequesterId == uid && f.Status == FriendshipStatus.Pending)
            .Select(f => f.AddresseeId)
            .ToListAsync();

        var incoming = await _db.Friendships
            .Where(f => f.AddresseeId == uid && f.Status == FriendshipStatus.Pending)
            .Select(f => f.RequesterId)
            .ToListAsync();

        var blocked = await _db.Friendships
            .Where(f => (f.RequesterId == uid || f.AddresseeId == uid)
                        && f.Status == FriendshipStatus.Blocked
                        && f.BlockedByUserId == uid)
            .Select(f => f.RequesterId == uid ? f.AddresseeId : f.RequesterId)
            .ToListAsync();

        var chatPartnerIds = await _db.ChatMessages
            .Where(m => m.SenderId == uid || m.ReceiverId == uid)
            .Select(m => m.SenderId == uid ? m.ReceiverId : m.SenderId)
            .Distinct()
            .ToListAsync();

        var allIds = friendIds
            .Concat(outgoing)
            .Concat(incoming)
            .Concat(blocked)
            .Concat(chatPartnerIds)
            .Distinct()
            .ToList();

        var profileLookup = allIds.Count == 0
            ? new Dictionary<string, (string? DisplayName, string? Email, string? UserName, string? AvatarUrl, string? StatusMessage, UserPresenceStatus PresenceStatus, bool IsInvisible, ProfileVisibility DisplayNameVisibility)>()
            : (await _db.Users
                .AsNoTracking()
                .Where(u => allIds.Contains(u.Id))
                .Select(u => new
                {
                    u.Id,
                    u.DisplayName,
                    u.Email,
                    u.UserName,
                    u.AvatarUrl,
                    u.StatusMessage,
                    u.PresenceStatus,
                    u.IsInvisible,
                    u.DisplayNameVisibility
                })
                .ToListAsync())
                .ToDictionary(u => u.Id, u => (u.DisplayName, u.Email, u.UserName, u.AvatarUrl, u.StatusMessage, u.PresenceStatus, u.IsInvisible, u.DisplayNameVisibility));

        var rankLookup = await BuildRankSnapshotsAsync(friendIds.Concat(blocked).ToList());

        var unreadLookup = friendIds.Count == 0
            ? new Dictionary<string, int>()
            : await _db.ChatMessages
                .Where(m => m.ReceiverId == uid && friendIds.Contains(m.SenderId) && !m.IsRead && !m.IsDeleted)
                .GroupBy(m => m.SenderId)
                .Select(g => new { g.Key, Count = g.Count() })
                .ToDictionaryAsync(g => g.Key, g => g.Count);

        var currentGameLookup = new Dictionary<string, (string Title, string Slug)>();
        if (friendIds.Count > 0)
        {
            var now = DateTime.UtcNow;
            var activeHostSessions = await _db.MatchSessions
                .Where(s => s.ExpiresAtUtc > now && friendIds.Contains(s.UserId))
                .Select(s => new { s.UserId, s.GameId, s.CreatedAtUtc })
                .ToListAsync();

            var activeGuestSessions = await _db.SessionPlayers
                .Where(p => friendIds.Contains(p.UserId))
                .Join(_db.MatchSessions.Where(s => s.ExpiresAtUtc > now),
                    player => player.SessionId,
                    session => session.Id,
                    (player, session) => new { player.UserId, session.GameId, session.CreatedAtUtc })
                .ToListAsync();

            var latestSessions = activeHostSessions
                .Concat(activeGuestSessions)
                .GroupBy(entry => entry.UserId)
                .Select(group => group.OrderByDescending(entry => entry.CreatedAtUtc).First())
                .ToList();

            var activeGameIds = latestSessions.Select(entry => entry.GameId).Distinct().ToList();
            var gameLookup = activeGameIds.Count == 0
                ? new Dictionary<Guid, (string Title, string Slug)>()
                : await _db.Games
                    .AsNoTracking()
                    .Where(g => activeGameIds.Contains(g.Id))
                    .Select(g => new { g.Id, g.Title, g.Slug })
                    .ToDictionaryAsync(g => g.Id, g => (g.Title, g.Slug));

            foreach (var session in latestSessions)
            {
                if (gameLookup.TryGetValue(session.GameId, out var game))
                {
                    currentGameLookup[session.UserId] = game;
                }
            }
        }

        bool CanSeeDisplayName(string id)
        {
            if (!profileLookup.TryGetValue(id, out var profile))
            {
                return true;
            }

            if (profile.DisplayNameVisibility == ProfileVisibility.Everyone)
            {
                return true;
            }

            return friendIds.Contains(id) || id == uid;
        }

        string ResolveName(string id)
        {
            if (profileLookup.TryGetValue(id, out var profile))
            {
                if (!CanSeeDisplayName(id))
                {
                    return _localizer["Dashboard_Profile_Private_DisplayName"].Value;
                }
                return DisplayNameFormatter.Format(profile.DisplayName, profile.Email, profile.UserName, id);
            }

            return CanSeeDisplayName(id)
                ? DisplayNameFormatter.Format(null, null, null, id)
                : _localizer["Dashboard_Profile_Private_DisplayName"].Value;
        }
        string? ResolveUserName(string id) => profileLookup.TryGetValue(id, out var profile) ? profile.UserName : null;

        string? ResolveAvatar(string id) => profileLookup.TryGetValue(id, out var profile) ? profile.AvatarUrl : null;

        string? ResolveStatusMessage(string id) => profileLookup.TryGetValue(id, out var profile)
            ? NormalizeStatus(profile.StatusMessage)
            : null;

        UserPresenceStatus ResolvePresence(string id)
        {
            var presence = profileLookup.TryGetValue(id, out var profile)
                ? profile.PresenceStatus
                : UserPresenceStatus.Offline;

            return ChatHub.HasActiveConnection(id) ? presence : UserPresenceStatus.Offline;
        }

        bool ResolveInvisible(string id) => profileLookup.TryGetValue(id, out var profile) && profile.IsInvisible;

        int ResolveUnread(string id) => unreadLookup.TryGetValue(id, out var count) ? count : 0;

        (string? Title, string? Slug) ResolveCurrentGame(string id) =>
            currentGameLookup.TryGetValue(id, out var game) ? (game.Title, game.Slug) : (null, null);


        RankSnapshot ResolveRank(string id)
        {
            if (rankLookup.TryGetValue(id, out var snapshot))
            {
                return snapshot;
            }

            return new RankSnapshot(null, "#38bdf8");
        }

        var acceptedDtos = friendIds
            .Select(id =>
            {
                var rank = ResolveRank(id);
                var currentGame = ResolveCurrentGame(id);
                return new FriendDto(
                    id,
                    ResolveName(id),
                    ResolveUserName(id),
                    rank.Title,
                    ResolveAvatar(id),
                    rank.AccentColor,
                    FriendshipStatus.Accepted,
                    false,
                    ResolveStatusMessage(id),
                    ResolvePresence(id),
                    ResolveInvisible(id),
                    ResolveUnread(id),
                    currentGame.Title,
                    currentGame.Slug,
                    false);
            })
            .ToList();

        var outgoingDtos = outgoing
            .Select(id =>
            {
                var rank = ResolveRank(id);
                var currentGame = ResolveCurrentGame(id);
                return new FriendDto(
                    id,
                    ResolveName(id),
                    ResolveUserName(id),
                    rank.Title,
                    ResolveAvatar(id),
                    rank.AccentColor,
                    FriendshipStatus.Pending,
                    true,
                    ResolveStatusMessage(id),
                    ResolvePresence(id),
                    ResolveInvisible(id),
                    0,
                    currentGame.Title,
                    currentGame.Slug,
                    false);
            })
            .ToList();

        var incomingDtos = incoming
            .Select(id =>
            {
                var rank = ResolveRank(id);
                var currentGame = ResolveCurrentGame(id);
                return new FriendDto(
                    id,
                    ResolveName(id),
                    ResolveUserName(id),
                    rank.Title,
                    ResolveAvatar(id),
                    rank.AccentColor,
                    FriendshipStatus.Pending,
                    false,
                    ResolveStatusMessage(id),
                    ResolvePresence(id),
                    ResolveInvisible(id),
                    0,
                    currentGame.Title,
                    currentGame.Slug,
                    false);
            })
            .ToList();

        var conversationOnlyIds = chatPartnerIds
            .Except(friendIds)
            .Except(outgoing)
            .Except(incoming)
            .Except(blocked)
            .ToList();

        var conversationDtos = conversationOnlyIds
            .Select(id =>
            {
                var rank = ResolveRank(id);
                var currentGame = ResolveCurrentGame(id);
                return new FriendDto(
                    id,
                    ResolveName(id),
                    ResolveUserName(id),
                    rank.Title,
                    ResolveAvatar(id),
                    rank.AccentColor,
                    FriendshipStatus.Pending,
                    false,
                    ResolveStatusMessage(id),
                    ResolvePresence(id),
                    ResolveInvisible(id),
                    0,
                    currentGame.Title,
                    currentGame.Slug,
                    true);
            })
            .ToList();

        var blockedDtos = blocked
            .Select(id =>
            {
                var rank = ResolveRank(id);
                var currentGame = ResolveCurrentGame(id);
                return new FriendDto(
                    id,
                    ResolveName(id),
                    ResolveUserName(id),
                    rank.Title,
                    ResolveAvatar(id),
                    rank.AccentColor,
                    FriendshipStatus.Blocked,
                    false,
                    ResolveStatusMessage(id),
                    ResolvePresence(id),
                    ResolveInvisible(id),
                    0,
                    currentGame.Title,
                    currentGame.Slug,
                    false);
            })
            .ToList();

        return Ok(acceptedDtos
            .Concat(outgoingDtos)
            .Concat(incomingDtos)
            .Concat(conversationDtos)
            .Concat(blockedDtos));

        static string? NormalizeStatus(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            var trimmed = value.Trim();
            return string.IsNullOrEmpty(trimmed) ? null : trimmed;
        }
    }

    [HttpGet("search")]
    public async Task<ActionResult<IEnumerable<FriendSearchResultDto>>> Search([FromQuery] string q)
    {
        var uid = UserId;
        if (string.IsNullOrWhiteSpace(uid))
        {
            return Unauthorized();
        }
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 1)
        {
            return Ok(Array.Empty<FriendSearchResultDto>());
        }

        var term = q.Trim();
        var lowered = term.ToLowerInvariant();
        var matchPattern = $"%{lowered}%";

        var relationships = await _db.Friendships
            .Where(f => f.RequesterId == uid || f.AddresseeId == uid)
            .Select(f => new
            {
                OtherUserId = f.RequesterId == uid ? f.AddresseeId : f.RequesterId,
                f.Status,
                Outgoing = f.RequesterId == uid,
                f.BlockedByUserId
            })
            .ToListAsync();

        var acceptedFriendIds = relationships
            .Where(r => r.Status == FriendshipStatus.Accepted)
            .Select(r => r.OtherUserId)
            .ToList();

        var pendingFriendIds = relationships
            .Where(r => r.Status == FriendshipStatus.Pending)
            .Select(r => r.OtherUserId)
            .ToList();

        var relationshipLookup = relationships
            .GroupBy(r => r.OtherUserId)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var blockedByCurrent = g.Any(x => x.Status == FriendshipStatus.Blocked && x.BlockedByUserId == uid);
                    var status = blockedByCurrent
                        ? FriendshipStatus.Blocked
                        : g.Select(x => x.Status).FirstOrDefault();
                    var outgoing = g.Any(x => x.Outgoing);
                    return (status, outgoing);
                });

        var relatedUserIds = acceptedFriendIds
            .Concat(pendingFriendIds)
            .ToList();

        var chatPartnerIds = await _db.ChatMessages
            .Where(m => m.SenderId == uid || m.ReceiverId == uid)
            .Select(m => m.SenderId == uid ? m.ReceiverId : m.SenderId)
            .Distinct()
            .ToListAsync();

        var friendsQuery = _db.Users
            .AsNoTracking()
            .Where(u => acceptedFriendIds.Contains(u.Id) || pendingFriendIds.Contains(u.Id))
            .Where(u => EF.Functions.Like((u.DisplayName ?? string.Empty).ToLower(), matchPattern)
                        || EF.Functions.Like((u.Email ?? string.Empty).ToLower(), matchPattern)
                        || EF.Functions.Like((u.UserName ?? string.Empty).ToLower(), matchPattern));

        var publicQuery = _db.Users
            .AsNoTracking()
            .Where(u => !u.IsBlocked)
            .Where(u => u.Id != uid)
            .Where(u => u.DisplayNameVisibility == ProfileVisibility.Everyone || relatedUserIds.Contains(u.Id) || chatPartnerIds.Contains(u.Id))
            .Where(u => EF.Functions.Like((u.DisplayName ?? string.Empty).ToLower(), matchPattern)
                        || EF.Functions.Like((u.Email ?? string.Empty).ToLower(), matchPattern)
                        || EF.Functions.Like((u.UserName ?? string.Empty).ToLower(), matchPattern));

        var directoryQuery = _db.Users
            .AsNoTracking()
            .Where(u => !u.IsBlocked)
            .Where(u => u.Id != uid)
            .Where(u => u.DisplayNameVisibility == ProfileVisibility.Everyone)
            .Where(u => EF.Functions.Like((u.DisplayName ?? string.Empty).ToLower(), matchPattern)
                        || EF.Functions.Like((u.Email ?? string.Empty).ToLower(), matchPattern)
                        || EF.Functions.Like((u.UserName ?? string.Empty).ToLower(), matchPattern));

        var results = await friendsQuery
            .Union(publicQuery)
            .Union(directoryQuery)
            .OrderBy(u => u.DisplayName ?? u.Email ?? u.UserName ?? u.Id)
            .Take(20)
             .Select(u => new
             {
                 u.Id,
                 u.DisplayName,
                 u.Email,
                 u.UserName,
                 u.AvatarUrl,
                 u.StatusMessage,
                 u.PresenceStatus,
                 u.IsInvisible,
                 u.DisplayNameVisibility
             })
            .ToListAsync();

        var hiddenLabel = _localizer["Dashboard_Profile_Private_DisplayName"].Value;
        string FormatDisplayName(string id, string? displayName, string? email, string? userName, ProfileVisibility visibility)
        {
            var isFriend = acceptedFriendIds.Contains(id);
            if (visibility != ProfileVisibility.Everyone && !isFriend)
            {
                return hiddenLabel;
            }

            return DisplayNameFormatter.Format(displayName, email, userName, id);
        }

        UserPresenceStatus ResolvePresence(string userId, UserPresenceStatus presence)
        {
            return ChatHub.HasActiveConnection(userId) ? presence : UserPresenceStatus.Offline;
        }

        var formattedResults = results
            .GroupBy(u => u.Id)
            .Select(g => g.First())
            .Select(u =>
            {
                var relation = relationshipLookup.TryGetValue(u.Id, out var value)
                     ? value
                     : ((FriendshipStatus?)null, false);
                return new FriendSearchResultDto(
                    u.Id,
                    FormatDisplayName(u.Id, u.DisplayName, u.Email, u.UserName, u.DisplayNameVisibility),
                    u.UserName,
                    u.AvatarUrl,
                    relation.Item1,
                    relation.Item2,
                    ResolvePresence(u.Id, u.PresenceStatus),
                    u.IsInvisible,
                    NormalizeStatusMessage(u.StatusMessage));
            });

        return Ok(formattedResults);
    }

    [HttpPost("send")]
    public async Task<ActionResult> Send([FromBody] FriendRequestDto dto)
    {
        var uid = UserId;
        if (string.IsNullOrWhiteSpace(uid))
        {
            return Unauthorized();
        }
        if (uid == dto.TargetUserId) return BadRequest("Nie można dodać siebie.");

        var exists = await _db.Friendships.AnyAsync(f =>
            (f.RequesterId == uid && f.AddresseeId == dto.TargetUserId) ||
            (f.RequesterId == dto.TargetUserId && f.AddresseeId == uid));
        if (exists) return Conflict("Zaproszenie już istnieje lub jesteście znajomymi.");

        _db.Friendships.Add(new Friendship
        {
            RequesterId = uid,
            AddresseeId = dto.TargetUserId,
            Status = FriendshipStatus.Pending
        });
        await _db.SaveChangesAsync();
        await _logger.LogAsync(ActivityLogType.FriendRequestSent, uid, log =>
        {
            log.TargetUserId = dto.TargetUserId;
        });
        await _hub.Clients.Group($"user-{dto.TargetUserId}").SendAsync("FriendRequestReceived", new
        {
            from_user_id = uid
        });
        return Ok();
    }

    [HttpPost("accept/{requesterId}")]
    public async Task<ActionResult> Accept(string requesterId)
    {
        var uid = UserId;
        if (string.IsNullOrWhiteSpace(uid))
        {
            return Unauthorized();
        }
        var fr = await _db.Friendships.FirstOrDefaultAsync(f => f.RequesterId == requesterId && f.AddresseeId == uid);
        if (fr is null) return NotFound();
        fr.Status = FriendshipStatus.Accepted;
        fr.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _logger.LogAsync(ActivityLogType.FriendRequestAccepted, uid, log =>
        {
            log.TargetUserId = requesterId;
        });
        await _hub.Clients.Group($"user-{requesterId}").SendAsync("FriendRequestAccepted", new
        {
            from_user_id = requesterId,
            to_user_id = uid
        });
        return Ok();
    }

    [HttpDelete("{userId}")]
    public async Task<ActionResult> Remove(string userId)
    {
        var uid = UserId;
        if (string.IsNullOrWhiteSpace(uid))
        {
            return Unauthorized();
        }
        var fr = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == uid && f.AddresseeId == userId) ||
            (f.RequesterId == userId && f.AddresseeId == uid));
        if (fr is null) return NotFound();
        _db.Friendships.Remove(fr);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("block/{userId}")]
    public async Task<ActionResult> Block(string userId)
    {
        var uid = UserId;
        if (string.IsNullOrWhiteSpace(uid))
        {
            return Unauthorized();
        }
        var fr = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == uid && f.AddresseeId == userId) ||
            (f.RequesterId == userId && f.AddresseeId == uid));

        if (fr is null)
        {
            fr = new Friendship { RequesterId = uid, AddresseeId = userId };
            _db.Friendships.Add(fr);
        }

        fr.Status = FriendshipStatus.Blocked;
        fr.BlockedByUserId = uid;
        fr.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpPost("unblock/{userId}")]
    public async Task<ActionResult> Unblock(string userId)
    {
        var uid = UserId;
        if (string.IsNullOrWhiteSpace(uid))
        {
            return Unauthorized();
        }
        var fr = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == uid && f.AddresseeId == userId) ||
            (f.RequesterId == userId && f.AddresseeId == uid));

        if (fr is null) return NotFound();

        _db.Friendships.Remove(fr);
        await _db.SaveChangesAsync();
        return Ok();
    }

    private static string? NormalizeStatusMessage(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private async Task<Dictionary<string, RankSnapshot>> BuildRankSnapshotsAsync(IReadOnlyCollection<string> userIds)
    {
        var ids = userIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();

        var result = new Dictionary<string, RankSnapshot>();
        if (ids.Count == 0)
        {
            return result;
        }

        var statsByUser = ids.ToDictionary(
            id => id,
            id => new DashboardStatsViewModel
            {
                GamePerformances = new List<GamePerformanceStat>()
            });

        var bonusExperience = await _db.Users
            .AsNoTracking()
            .Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.BonusExperience })
            .ToListAsync();

        foreach (var entry in bonusExperience)
        {
            if (statsByUser.TryGetValue(entry.Id, out var stats))
            {
                stats.BonusExperience = entry.BonusExperience;
            }
        }

        var uploadedCounts = await _db.Games
            .AsNoTracking()
            .Where(g => ids.Contains(g.CreatedByUserId))
            .GroupBy(g => g.CreatedByUserId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync();

        foreach (var entry in uploadedCounts)
        {
            if (statsByUser.TryGetValue(entry.Key, out var stats))
            {
                stats.UploadedGames = entry.Count;
            }
        }

        var ratingCounts = await _db.GameReviews
            .AsNoTracking()
            .Where(r => ids.Contains(r.UserId) && r.IsRating)
            .GroupBy(r => r.UserId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync();

        foreach (var entry in ratingCounts)
        {
            if (statsByUser.TryGetValue(entry.Key, out var stats))
            {
                stats.TotalRatings = entry.Count;
            }
        }

        var commentCounts = await _db.GameReviews
            .AsNoTracking()
            .Where(r => ids.Contains(r.UserId) && !string.IsNullOrEmpty(r.Comment))
            .GroupBy(r => r.UserId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync();

        foreach (var entry in commentCounts)
        {
            if (statsByUser.TryGetValue(entry.Key, out var stats))
            {
                stats.TotalComments = entry.Count;
            }
        }

        var dailyLogins = await _db.ActivityLogs
            .AsNoTracking()
            .Where(log => log.Type == ActivityLogType.DailyLogin && log.ActorUserId != null && ids.Contains(log.ActorUserId))
            .GroupBy(log => log.ActorUserId!)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync();

        foreach (var entry in dailyLogins)
        {
            if (statsByUser.TryGetValue(entry.Key, out var stats))
            {
                stats.DailyLoginCount = entry.Count;
            }
        }

        var multiplayerSessions = await _db.SessionPlayers
            .AsNoTracking()
            .Where(player => ids.Contains(player.UserId))
            .GroupBy(player => player.SessionId)
            .Select(group => new
            {
                group.Key,
                UserIds = group.Select(x => x.UserId).Distinct().ToList()
            })
            .ToListAsync();

        foreach (var session in multiplayerSessions)
        {
            if (session.UserIds.Count <= 1)
            {
                continue;
            }

            foreach (var userId in session.UserIds)
            {
                if (statsByUser.TryGetValue(userId, out var stats))
                {
                    stats.MultiplayerMatches++;
                }
            }
        }

        var scoreTotals = await _db.Scores
            .AsNoTracking()
            .Where(s => ids.Contains(s.UserId))
            .GroupBy(s => s.UserId)
            .Select(g => new
            {
                g.Key,
                Count = g.Count(),
                Last = g.Max(x => (DateTime?)x.SubmittedAtUtc)
            })
            .ToListAsync();

        foreach (var entry in scoreTotals)
        {
            if (statsByUser.TryGetValue(entry.Key, out var stats))
            {
                stats.TotalScores = entry.Count;
                stats.LastScoreSubmittedAt = entry.Last;
            }
        }

        var friendConnections = await _db.Friendships
            .AsNoTracking()
            .Where(f => f.Status == FriendshipStatus.Accepted && (ids.Contains(f.RequesterId) || ids.Contains(f.AddresseeId)))
            .Select(f => new { f.RequesterId, f.AddresseeId })
            .ToListAsync();

        foreach (var entry in friendConnections)
        {
            if (statsByUser.TryGetValue(entry.RequesterId, out var requesterStats))
            {
                requesterStats.FriendsCount++;
            }

            if (statsByUser.TryGetValue(entry.AddresseeId, out var addresseeStats))
            {
                addresseeStats.FriendsCount++;
            }
        }

        var scoreGroups = await _db.Scores
            .AsNoTracking()
            .Where(s => ids.Contains(s.UserId))
            .GroupBy(s => new { s.UserId, s.GameId })
            .Select(g => new
            {
                g.Key.UserId,
                g.Key.GameId,
                PlayCount = g.Count(),
                BestScore = g.Max(x => x.Value),
                LastPlayedAt = g.Max(x => x.SubmittedAtUtc)
            })
            .ToListAsync();

        var gameIds = scoreGroups.Select(g => g.GameId).Distinct().ToList();

        var gameTitles = gameIds.Count == 0
            ? new Dictionary<Guid, string>()
            : (await _db.Games
                .AsNoTracking()
                .Where(g => gameIds.Contains(g.Id))
                .Select(g => new { g.Id, g.Title })
                .ToListAsync())
                .ToDictionary(g => g.Id, g => g.Title);

        var bestScores = gameIds.Count == 0
            ? new List<(Guid GameId, string UserId, double BestScore)>()
            : (await _db.Scores
                .AsNoTracking()
                .Where(s => gameIds.Contains(s.GameId))
                .GroupBy(s => new { s.GameId, s.UserId })
                .Select(g => new
                {
                    g.Key.GameId,
                    g.Key.UserId,
                    BestScore = g.Max(x => x.Value)
                })
                .ToListAsync())
                .Select(x => (x.GameId, x.UserId, x.BestScore))
                .ToList();

        var leaderboardLookup = bestScores
            .GroupBy(x => x.GameId)
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(x => x.BestScore).ToList());

        var matchExperienceByUserGame = await _db.SessionPlayers
           .AsNoTracking()
           .Where(player => ids.Contains(player.UserId))
           .Join(_db.MatchSessions.AsNoTracking(),
               player => player.SessionId,
               session => session.Id,
               (player, session) => new { player.UserId, session.GameId, player.Role })
           .GroupBy(entry => new { entry.UserId, entry.GameId })
           .Select(group => new
           {
               group.Key.UserId,
               group.Key.GameId,
               Wins = group.Count(entry => entry.Role == "winner"),
               Losses = group.Count(entry => entry.Role == "loser"),
               Draws = group.Count(entry => entry.Role == "draw")
           })
           .ToDictionaryAsync(
               entry => (entry.UserId, entry.GameId),
               entry => RankCalculator.CalculateMatchExperience(entry.Wins, entry.Losses, entry.Draws));

        foreach (var grouping in scoreGroups.GroupBy(x => x.UserId))
        {
            if (!statsByUser.TryGetValue(grouping.Key, out var stats))
            {
                continue;
            }

            var performances = new List<GamePerformanceStat>();

            foreach (var entry in grouping)
            {
                if (!gameTitles.TryGetValue(entry.GameId, out var title) ||
                    !leaderboardLookup.TryGetValue(entry.GameId, out var leaderboard))
                {
                    continue;
                }

                var totalPlayers = leaderboard.Count;
                var position = leaderboard.FindIndex(x => x.UserId == entry.UserId) + 1;
                if (position <= 0)
                {
                    position = totalPlayers;
                }

                var matchExperience = matchExperienceByUserGame.GetValueOrDefault((entry.UserId, entry.GameId));

                performances.Add(new GamePerformanceStat(
                    entry.GameId,
                    title,
                    entry.PlayCount,
                    entry.BestScore,
                    position,
                    totalPlayers,
                    matchExperience,
                    entry.LastPlayedAt));
            }

            stats.GamePerformances = performances;
        }

        foreach (var id in ids)
        {
            if (!statsByUser.TryGetValue(id, out var stats))
            {
                continue;
            }

            var rank = RankCalculator.CalculateRank(stats);
            result[id] = new RankSnapshot(rank.DisplayName, rank.AccentColor);
        }

        return result;
    }
}
