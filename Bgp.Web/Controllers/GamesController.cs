using System;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Security.Claims;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Bgp.Web.Models;
using Bgp.Web.Services;
using Bgp.Web.Resources;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.Controllers;

public class GamesController : Controller
{
    private readonly AppDbContext _db;
    private readonly IStringLocalizer<SharedResource> _localizer;
    private readonly IGameContentResolver _contentResolver;
    private readonly IActivityLogger _activityLogger;

    public GamesController(AppDbContext db, IStringLocalizer<SharedResource> localizer, IGameContentResolver contentResolver, IActivityLogger activityLogger)
    {
        _db = db;
        _localizer = localizer;
        _contentResolver = contentResolver;
        _activityLogger = activityLogger;
    }

    [AllowAnonymous]
    public async Task<IActionResult> Index(string? search = null, string? category = null, string? tag = null)
    {
        var gamesQuery = _db.Games
            .AsNoTracking()
            .Include(g => g.Tags)
            .Where(g => g.ApprovalStatus == GameApprovalStatus.Approved);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            gamesQuery = gamesQuery.Where(g =>
                EF.Functions.Like(g.Title, term) ||
                EF.Functions.Like(g.Description ?? string.Empty, term));
        }

        var categoryFilter = ParseCategory(category);
        if (categoryFilter.HasValue && categoryFilter.Value != GameCategory.None)
        {
            var filter = categoryFilter.Value;
            gamesQuery = gamesQuery.Where(g => (g.Categories & filter) != 0);
        }

        var normalizedTag = NormalizeTag(tag);
        if (!string.IsNullOrWhiteSpace(normalizedTag))
        {
            gamesQuery = gamesQuery.Where(g => g.Tags.Any(t => t.IsApproved && t.Value == normalizedTag));
        }

        var projectedGames = await gamesQuery
            .OrderByDescending(g => g.CreatedAtUtc)
            .Select(g => new
            {
                g.Id,
                g.Title,
                g.Slug,
                g.CoverImagePath,
                g.Description,
                g.Modes,
                g.Categories,
                Tags = g.Tags
                    .Where(t => t.IsApproved)
                    .OrderBy(t => t.Value)
                    .Select(t => t.Value)
                    .ToList()
            })
            .ToListAsync();

        var gameIds = projectedGames.Select(g => g.Id).ToList();
        var activeLookup = new Dictionary<Guid, int>();
        var ratingLookup = new Dictionary<Guid, (double Average, int Count)>();

        if (gameIds.Count > 0)
        {
            var now = DateTime.UtcNow;
            activeLookup = await _db.MatchSessions
                .AsNoTracking()
                .Where(s => gameIds.Contains(s.GameId) && !s.Used && s.ExpiresAtUtc > now)
                .GroupBy(s => s.GameId)
                .Select(group => new
                {
                    GameId = group.Key,
                    Count = group
                        .Select(s => s.UserId)
                        .Distinct()
                        .Count()
                })
                .ToDictionaryAsync(x => x.GameId, x => x.Count);

            ratingLookup = await _db.GameReviews
                .AsNoTracking()
                .Where(r => gameIds.Contains(r.GameId) && r.IsRating && r.Stars > 0)
                .GroupBy(r => r.GameId)
                .Select(group => new
                {
                    GameId = group.Key,
                    Average = group.Average(r => r.Stars),
                    Count = group.Count()
                })
                .ToDictionaryAsync(x => x.GameId, x => (x.Average, x.Count));
        }

        var games = projectedGames
            .Select(g => new GameCatalogItemViewModel(
                g.Id,
                g.Title,
                g.Slug,
                g.CoverImagePath,
                ratingLookup.TryGetValue(g.Id, out var rating) ? rating.Average : 0.0,
                ratingLookup.TryGetValue(g.Id, out rating) ? rating.Count : 0,
                g.Modes,
                g.Categories,
                g.Tags,
                string.IsNullOrWhiteSpace(g.Description) ? null : g.Description,
                activeLookup.TryGetValue(g.Id, out var active) ? active : 0))
            .ToList();

        var tagOptions = await _db.GameTags
            .AsNoTracking()
            .Where(t => t.IsApproved)
            .GroupBy(t => t.Value)
            .Select(g => new { Value = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ThenBy(x => x.Value)
            .Take(30)
            .ToListAsync();

        var vm = new GameCatalogViewModel
        {
            Games = games,
            Filters = new GameCatalogFilterModel
            {
                Search = search,
                Category = category,
                Tag = normalizedTag
            },
            CategoryOptions = BuildCategoryFilterOptions(categoryFilter),
            TagOptions = tagOptions
                .Select(t => new SelectListItem
                {
                    Value = t.Value,
                    Text = $"{t.Value} ({t.Count})",
                    Selected = string.Equals(t.Value, normalizedTag, StringComparison.OrdinalIgnoreCase)
                })
                .ToList()
        };

        return View(vm);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    [Authorize(Roles = "Admin,Moderator")]
    public async Task<IActionResult> ClearGameRankings(Guid id, string slug)
    {
        if (id == Guid.Empty)
        {
            return NotFound();
        }

        var game = await _db.Games.AsNoTracking()
            .FirstOrDefaultAsync(g => g.Id == id && g.Slug == slug && g.ApprovalStatus == GameApprovalStatus.Approved);

        if (game is null)
        {
            return NotFound();
        }

        var actorId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        await ClearGameRankingDataAsync(id, actorId);
        await _db.SaveChangesAsync();

        return RedirectToAction(nameof(Details), new { slug = game.Slug, tab = "ranking" });
    }

    [Authorize]
    public async Task<IActionResult> Details(string slug)
    {
        var g = await _db.Games
            .Include(x => x.Versions)
            .Include(x => x.Tags)
            .Include(x => x.Locales)
            .Include(x => x.Assets)
            .FirstOrDefaultAsync(x => x.Slug == slug && x.ApprovalStatus == GameApprovalStatus.Approved);

        if (g is null)
        {
            return NotFound();
        }

        var currentLocale = CultureInfo.CurrentUICulture.Name;
        var locale = g.ResolveLocale(currentLocale);

        var latest = g.Versions.OrderByDescending(v => v.PublishedAtUtc).FirstOrDefault();
        var playOptions = _contentResolver.Resolve(latest?.ContentPath);

        var now = DateTime.UtcNow;
        var activePlayers = await _db.MatchSessions
            .AsNoTracking()
            .Where(s => s.GameId == g.Id && !s.Used && s.ExpiresAtUtc > now)
            .Select(s => s.UserId)
            .Distinct()
            .CountAsync();

        var reviewsQuery = _db.GameReviews.AsNoTracking()
            .Where(r => r.GameId == g.Id && r.IsRating && r.Stars > 0);
        var ratingStats = await reviewsQuery
            .GroupBy(_ => 1)
            .Select(group => new
            {
                Average = group.Average(r => r.Stars),
                Count = group.Count()
            })
            .FirstOrDefaultAsync();
        var distributionRaw = await reviewsQuery
            .GroupBy(r => r.Stars)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync();

        var distribution = Enumerable.Range(1, 5)
            .ToDictionary(v => v, v => distributionRaw.FirstOrDefault(d => d.Key == v)?.Count ?? 0);

        int? userRating = null;
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrEmpty(userId))
        {
            userRating = await _db.GameReviews
                .Where(r => r.GameId == g.Id && r.UserId == userId && r.IsRating)
                .Select(r => (int?)r.Stars)
                .FirstOrDefaultAsync();
        }

        var vm = new GameDetailsViewModel
        {
            Game = g,
            Locale = locale,
            PlayOptions = playOptions,
            DisplayTitle = locale?.Title ?? g.Title,
            DisplayDescription = locale?.Description ?? g.Description,
            DisplayRules = locale?.RulesContent ?? g.Rules,
            CurrentLocale = currentLocale,
            DefaultLocale = g.DefaultLocale,
            BannerUrl = g.ResolveAsset(GameAssetType.Banner, currentLocale),
            ThumbnailUrl = g.ResolveAsset(GameAssetType.Thumbnail, currentLocale) ?? g.CoverImagePath,
            GalleryUrls = g.ResolveGallery(currentLocale),
            Assets = g.Assets.ToList(),
            AverageRating = ratingStats?.Average ?? 0,
            ReviewCount = ratingStats?.Count ?? 0,
            RatingDistribution = distribution,
            UserRating = userRating,
            ActivePlayerCount = activePlayers
        };

        return View(vm);
    }

    private IReadOnlyList<SelectListItem> BuildCategoryFilterOptions(GameCategory? selected)
    {
        return GameMetadataOptions.CategoryDefinitions
            .Select(option => new SelectListItem
            {
                Value = ((int)option.Category).ToString(CultureInfo.InvariantCulture),
                Text = _localizer[option.ResourceKey],
                Selected = selected.HasValue && option.Category == selected.Value
            })
            .OrderBy(option => option.Text, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

    private async Task ClearGameRankingDataAsync(Guid gameId, string? actorUserId)
    {
        var affectedUsers = await _db.Scores
            .Where(s => s.GameId == gameId)
            .Select(s => s.UserId)
            .Distinct()
            .ToListAsync();

        if (affectedUsers.Count == 0)
        {
            affectedUsers = await _db.SessionPlayers
                .Where(p => p.SessionId != Guid.Empty)
                .Join(_db.MatchSessions,
                    player => player.SessionId,
                    session => session.Id,
                    (player, session) => new { session.GameId, player.UserId })
                .Where(entry => entry.GameId == gameId)
                .Select(entry => entry.UserId)
                .Distinct()
                .ToListAsync();
        }
        var sessionIds = await _db.MatchSessions
            .Where(s => s.GameId == gameId)
            .Select(s => s.Id)
            .ToListAsync();

        if (sessionIds.Count > 0)
        {
            var invites = await _db.GameInvites
                .Where(i => sessionIds.Contains(i.SessionId))
                .ToListAsync();
            _db.GameInvites.RemoveRange(invites);

            var players = await _db.SessionPlayers
                .Where(p => sessionIds.Contains(p.SessionId))
                .ToListAsync();
            _db.SessionPlayers.RemoveRange(players);

            var sessions = await _db.MatchSessions
                .Where(s => sessionIds.Contains(s.Id))
                .ToListAsync();
            _db.MatchSessions.RemoveRange(sessions);
        }

        var scores = await _db.Scores
            .Where(s => s.GameId == gameId)
            .ToListAsync();
        _db.Scores.RemoveRange(scores);

        if (affectedUsers.Count > 0)
        {
            foreach (var userId in affectedUsers)
            {
                await _activityLogger.LogAsync(ActivityLogType.GameRankingCleared, actorUserId, log =>
                {
                    log.TargetUserId = userId;
                    log.GameId = gameId;
                });
            }
        }
    }
    private static GameCategory? ParseCategory(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numeric) && Enum.IsDefined(typeof(GameCategory), numeric))
        {
            return (GameCategory)numeric;
        }

        if (Enum.TryParse<GameCategory>(raw, true, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static string? NormalizeTag(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var value = raw.Trim().ToLowerInvariant();
        value = Regex.Replace(value, "[^a-z0-9#+-]", " ");
        value = Regex.Replace(value, "\\s+", " ").Trim();
        if (value.Length < 2)
        {
            return null;
        }

        return value.Length > 40 ? value[..40] : value;
    }
}
