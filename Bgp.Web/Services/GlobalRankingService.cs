using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Bgp.Web.Models;
using Bgp.Web.Resources;
using Bgp.Web.ViewModels;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.Services;

public class GlobalRankingService
{
    private readonly AppDbContext _db;
    private readonly IStringLocalizer<SharedResource> _localizer;

    public GlobalRankingService(AppDbContext db, IStringLocalizer<SharedResource> localizer)
    {
        _db = db;
        _localizer = localizer;
    }

    public async Task<GlobalRankingViewModel> GetRankingAsync(string? viewerUserId, CancellationToken cancellationToken = default)
    {
        var users = await _db.Users
            .AsNoTracking()
            .Where(u => !u.IsBlocked)
            .Select(u => new
            {
                u.Id,
                u.DisplayName,
                u.Email,
                u.UserName,
                u.AvatarUrl,
                u.PresenceStatus,
                u.IsInvisible,
                u.BonusExperience,
                u.CreatedAtUtc
            })
            .ToListAsync(cancellationToken);

        if (users.Count == 0)
        {
            return new GlobalRankingViewModel
            {
                CurrentUserId = viewerUserId,
                Entries = Array.Empty<GlobalRankingEntryViewModel>()
            };
        }

        var uploads = await _db.Games
            .AsNoTracking()
            .GroupBy(g => g.CreatedByUserId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Key, g => g.Count, cancellationToken);

        var reviews = await _db.GameReviews
            .AsNoTracking()
            .Where(r => r.IsRating)
            .GroupBy(r => r.UserId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Key, g => g.Count, cancellationToken);

        var scores = await _db.Scores
            .AsNoTracking()
            .GroupBy(s => s.UserId)
            .Select(g => new
            {
                g.Key,
                Count = g.Count(),
                Best = g.Max(x => x.Value),
                Last = g.Max(x => x.SubmittedAtUtc)
            })
            .ToDictionaryAsync(g => g.Key, g => g, cancellationToken);

        var playsByUser = await _db.Scores
            .AsNoTracking()
            .GroupBy(s => new { s.UserId, s.GameId })
            .Select(g => new
            {
                g.Key.UserId,
                g.Key.GameId,
                Count = g.Count()
            })
            .ToListAsync(cancellationToken);

        var mostPlayedByUser = playsByUser
            .GroupBy(x => x.UserId)
            .ToDictionary(
                g => g.Key,
                g => g
                    .OrderByDescending(x => x.Count)
                    .ThenBy(x => x.GameId)
                    .First());

        var mostPlayedGameIds = mostPlayedByUser.Values
            .Select(x => x.GameId)
            .Distinct()
            .ToArray();

        var gameTitles = mostPlayedGameIds.Length == 0
            ? new Dictionary<Guid, string>()
            : await _db.Games
                .AsNoTracking()
                .Where(g => mostPlayedGameIds.Contains(g.Id))
                .Select(g => new { g.Id, g.Title })
                .ToDictionaryAsync(g => g.Id, g => g.Title ?? string.Empty, cancellationToken);

        var friendCounts = new Dictionary<string, int>(StringComparer.Ordinal);
        var friendships = await _db.Friendships
            .AsNoTracking()
            .Where(f => f.Status == FriendshipStatus.Accepted)
            .Select(f => new { f.RequesterId, f.AddresseeId })
            .ToListAsync(cancellationToken);

        var viewerFriendIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var friendship in friendships)
        {
            if (!string.IsNullOrWhiteSpace(friendship.RequesterId))
            {
                friendCounts[friendship.RequesterId] = friendCounts.GetValueOrDefault(friendship.RequesterId) + 1;
                if (viewerUserId is not null && string.Equals(friendship.RequesterId, viewerUserId, StringComparison.Ordinal))
                {
                    viewerFriendIds.Add(friendship.AddresseeId);
                }
            }

            if (!string.IsNullOrWhiteSpace(friendship.AddresseeId))
            {
                friendCounts[friendship.AddresseeId] = friendCounts.GetValueOrDefault(friendship.AddresseeId) + 1;
                if (viewerUserId is not null && string.Equals(friendship.AddresseeId, viewerUserId, StringComparison.Ordinal))
                {
                    viewerFriendIds.Add(friendship.RequesterId);
                }
            }
        }

        var totalPlayers = Math.Max(1, users.Count);
        var entries = new List<GlobalRankingEntryViewModel>(users.Count);

        foreach (var user in users)
        {
            var scoreInfo = scores.GetValueOrDefault(user.Id);
            var lastActivity = scoreInfo?.Last ?? user.CreatedAtUtc;
            var playCount = Math.Max(1, scoreInfo?.Count ?? 0);
            var bestScore = Math.Max(1d, scoreInfo?.Best ?? 0d);

            var stats = new DashboardStatsViewModel
            {
                UploadedGames = uploads.GetValueOrDefault(user.Id),
                TotalScores = scoreInfo?.Count ?? 0,
                TotalReviews = reviews.GetValueOrDefault(user.Id),
                FriendsCount = friendCounts.GetValueOrDefault(user.Id),
                BonusExperience = user.BonusExperience,
                GamePerformances = new List<GamePerformanceStat>
                {
                    new(
                        Guid.Empty,
                        "global",
                        playCount,
                        bestScore,
                        1,
                        totalPlayers,
                        lastActivity)
                },
                LastScoreSubmittedAt = lastActivity
            };

            var rank = RankCalculator.CalculateRank(stats);
            var xp = Math.Max(0, rank.ExperiencePoints);
            var level = Math.Max(1, (int)Math.Floor(xp / 120d) + 1);
            var presenceStatus = user.IsInvisible ? UserPresenceStatus.Invisible : user.PresenceStatus;
            var presenceLabel = presenceStatus switch
            {
                UserPresenceStatus.Available => _localizer["Chat_Status_Available"].Value,
                UserPresenceStatus.Away => _localizer["Chat_Status_Away"].Value,
                UserPresenceStatus.DoNotDisturb => _localizer["Chat_Status_Dnd"].Value,
                UserPresenceStatus.Invisible => _localizer["Chat_Status_Invisible"].Value,
                _ => _localizer["Chat_Status_Offline"].Value
            };

            var displayName = DisplayNameFormatter.Format(user.DisplayName, user.Email, user.UserName, user.Id)
                ?? user.UserName
                ?? user.Id;

            entries.Add(new GlobalRankingEntryViewModel
            {
                UserId = user.Id,
                DisplayName = displayName,
                RankTitle = rank.DisplayName,
                Tier = rank.Tier,
                ExperiencePoints = xp,
                Level = level,
                AvatarUrl = user.AvatarUrl,
                MostPlayedGameTitle = mostPlayedByUser.TryGetValue(user.Id, out var mostPlayed) && gameTitles.TryGetValue(mostPlayed.GameId, out var title)
                    ? title
                    : null,
                PresenceStatus = presenceStatus,
                PresenceLabel = presenceLabel,
                AccentColor = rank.AccentColor,
                AccentHighlightColor = rank.AccentHighlightColor,
                IsFriend = viewerFriendIds.Contains(user.Id),
                IsCurrentUser = viewerUserId is not null && string.Equals(user.Id, viewerUserId, StringComparison.Ordinal)
            });
        }

        var ordered = entries
            .OrderByDescending(e => e.ExperiencePoints)
            .ThenBy(e => e.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ToList();

        for (var i = 0; i < ordered.Count; i++)
        {
            ordered[i].Position = i + 1;
        }

        return new GlobalRankingViewModel
        {
            CurrentUserId = viewerUserId,
            Entries = ordered
        };
    }
}