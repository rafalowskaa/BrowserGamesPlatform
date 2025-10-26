using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using Bgp.Application.Dtos;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Bgp.Web.Helpers;
using Microsoft.EntityFrameworkCore;
using Bgp.Web.Models;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/friends")]
[Authorize]
public class FriendsController : ControllerBase
{
    private readonly AppDbContext _db;
    public FriendsController(AppDbContext db) => _db = db;

    private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);
    private readonly record struct RankSnapshot(string? Title, string AccentColor);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<FriendDto>>> Get()
    {
        var uid = UserId!;

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

        var allIds = friendIds
            .Concat(outgoing)
            .Concat(incoming)
            .Distinct()
            .ToList();

        var profileLookup = allIds.Count == 0
            ? new Dictionary<string, (string? DisplayName, string? Email, string? UserName, string? AvatarUrl, string? StatusMessage, UserPresenceStatus PresenceStatus, bool IsInvisible)>()
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
                    u.IsInvisible
                })
                .ToListAsync())
                .ToDictionary(u => u.Id, u => (u.DisplayName, u.Email, u.UserName, u.AvatarUrl, u.StatusMessage, u.PresenceStatus, u.IsInvisible));

        var rankLookup = await BuildRankSnapshotsAsync(friendIds);

        var unreadLookup = friendIds.Count == 0
            ? new Dictionary<string, int>()
            : await _db.ChatMessages
                .Where(m => m.ReceiverId == uid && friendIds.Contains(m.SenderId) && !m.IsRead)
                .GroupBy(m => m.SenderId)
                .Select(g => new { g.Key, Count = g.Count() })
                .ToDictionaryAsync(g => g.Key, g => g.Count);

        string ResolveName(string id)
        {
            if (profileLookup.TryGetValue(id, out var profile))
            {
                return DisplayNameFormatter.Format(profile.DisplayName, profile.Email, profile.UserName, id);
            }

            return DisplayNameFormatter.Format(null, null, null, id);
        }

        string? ResolveAvatar(string id) => profileLookup.TryGetValue(id, out var profile) ? profile.AvatarUrl : null;

        string? ResolveStatusMessage(string id) => profileLookup.TryGetValue(id, out var profile)
            ? NormalizeStatus(profile.StatusMessage)
            : null;

        UserPresenceStatus ResolvePresence(string id) => profileLookup.TryGetValue(id, out var profile)
            ? profile.PresenceStatus
            : UserPresenceStatus.Available;

        bool ResolveInvisible(string id) => profileLookup.TryGetValue(id, out var profile) && profile.IsInvisible;

        int ResolveUnread(string id) => unreadLookup.TryGetValue(id, out var count) ? count : 0;

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
                return new FriendDto(
                    id,
                    ResolveName(id),
                    rank.Title,
                    ResolveAvatar(id),
                    rank.AccentColor,
                    FriendshipStatus.Accepted,
                    false,
                    ResolveStatusMessage(id),
                    ResolvePresence(id),
                    ResolveInvisible(id),
                    ResolveUnread(id));
            })
            .ToList();

        var outgoingDtos = outgoing
            .Select(id =>
            {
                var rank = ResolveRank(id);
                return new FriendDto(
                    id,
                    ResolveName(id),
                    rank.Title,
                    ResolveAvatar(id),
                    rank.AccentColor,
                    FriendshipStatus.Pending,
                    true,
                    ResolveStatusMessage(id),
                    ResolvePresence(id),
                    ResolveInvisible(id),
                    0);
            })
            .ToList();

        var incomingDtos = incoming
            .Select(id =>
            {
                var rank = ResolveRank(id);
                return new FriendDto(
                    id,
                    ResolveName(id),
                    rank.Title,
                    ResolveAvatar(id),
                    rank.AccentColor,
                    FriendshipStatus.Pending,
                    false,
                    ResolveStatusMessage(id),
                    ResolvePresence(id),
                    ResolveInvisible(id),
                    0);
            })
            .ToList();

        return Ok(acceptedDtos.Concat(outgoingDtos).Concat(incomingDtos));

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
    public async Task<ActionResult<IEnumerable<object>>> Search([FromQuery] string q)
    {
        var uid = UserId!;
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
        {
            return Ok(Array.Empty<object>());
        }

        var term = q.Trim();

        var excludedIds = await _db.Friendships
            .Where(f => f.RequesterId == uid || f.AddresseeId == uid)
            .Select(f => f.RequesterId == uid ? f.AddresseeId : f.RequesterId)
            .ToListAsync();
        excludedIds.Add(uid);

        var results = await _db.Users
            .AsNoTracking()
            .Where(u => !u.IsBlocked)
            .Where(u => !excludedIds.Contains(u.Id))
            .Where(u => EF.Functions.Like(u.DisplayName ?? u.Email ?? u.UserName ?? string.Empty, $"%{term}%"))
            .OrderBy(u => u.DisplayName ?? u.Email ?? u.UserName ?? u.Id)
            .Take(12)
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName, u.AvatarUrl })
            .ToListAsync();

        var formattedResults = results
            .Select(u => new
            {
                u.Id,
                Name = DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id),
                u.AvatarUrl
            });

        return Ok(formattedResults);
    }

    [HttpPost("send")]
    public async Task<ActionResult> Send([FromBody] FriendRequestDto dto)
    {
        var uid = UserId!;
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
        return Ok();
    }

    [HttpPost("accept/{requesterId}")]
    public async Task<ActionResult> Accept(string requesterId)
    {
        var uid = UserId!;
        var fr = await _db.Friendships.FirstOrDefaultAsync(f => f.RequesterId == requesterId && f.AddresseeId == uid);
        if (fr is null) return NotFound();
        fr.Status = FriendshipStatus.Accepted;
        fr.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("{userId}")]
    public async Task<ActionResult> Remove(string userId)
    {
        var uid = UserId!;
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
        var uid = UserId!;
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
        var uid = UserId!;
        var fr = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == uid && f.AddresseeId == userId) ||
            (f.RequesterId == userId && f.AddresseeId == uid));

        if (fr is null) return NotFound();

        _db.Friendships.Remove(fr);
        await _db.SaveChangesAsync();
        return Ok();
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

        var reviewCounts = await _db.GameReviews
            .AsNoTracking()
            .Where(r => ids.Contains(r.UserId))
            .GroupBy(r => r.UserId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync();

        foreach (var entry in reviewCounts)
        {
            if (statsByUser.TryGetValue(entry.Key, out var stats))
            {
                stats.TotalReviews = entry.Count;
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

                performances.Add(new GamePerformanceStat(
                    entry.GameId,
                    title,
                    entry.PlayCount,
                    entry.BestScore,
                    position,
                    totalPlayers,
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
