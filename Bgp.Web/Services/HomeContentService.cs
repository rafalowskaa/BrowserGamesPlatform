using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Bgp.Web.ViewModels;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Bgp.Web.Services;

public class HomeContentService
{
    private readonly AppDbContext _db;
    private readonly HomeContentOptions _options;

    public HomeContentService(
        AppDbContext db,
        IOptions<HomeContentOptions> options)
    {
        _db = db;
        _options = options.Value;
    }

    public async Task<IReadOnlyList<GameSummaryViewModel>> GetFeaturedAsync(int limit, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var scheduled = await _db.HomeFeaturedGames
            .AsNoTracking()
            .Where(f => f.IsActive && f.StartsAtUtc <= now && f.EndsAtUtc >= now)
            .OrderBy(f => f.StartsAtUtc)
            .ThenBy(f => f.Id)
            .Take(limit)
            .Select(f => new
            {
                f.GameId,
                f.CustomDescription
            })
            .ToListAsync(cancellationToken);

        if (!scheduled.Any())
        {
            return await GetPopularAsync(limit, cancellationToken: cancellationToken);
        }

        var ids = scheduled.Select(f => f.GameId).Distinct().ToList();
        var projections = await CreateGameProjection()
            .Where(g => ids.Contains(g.Id))
            .ToListAsync(cancellationToken);

        var summaries = new List<GameSummaryViewModel>(limit);
        foreach (var entry in scheduled)
        {
            var projection = projections.FirstOrDefault(p => p.Id == entry.GameId);
            if (projection is null)
            {
                continue;
            }

            var summary = MapToSummary(projection);
            if (!string.IsNullOrWhiteSpace(entry.CustomDescription))
            {
                summary.Excerpt = entry.CustomDescription!;
            }
            summaries.Add(summary);
        }

        if (summaries.Count < limit)
        {
            var fallback = await GetPopularAsync(limit, cancellationToken: cancellationToken);
            foreach (var game in fallback)
            {
                if (summaries.Count >= limit)
                {
                    break;
                }

                if (summaries.All(existing => existing.Id != game.Id))
                {
                    summaries.Add(game);
                }
            }
        }

        return summaries;
    }

    public async Task<IReadOnlyList<GameSummaryViewModel>> GetPopularAsync(int limit, string? tag = null, CancellationToken cancellationToken = default)
    {
        var query = CreateGameProjection();

        if (!string.IsNullOrWhiteSpace(tag))
        {
            query = query.Where(g => g.Tags.Contains(tag));
        }

        var items = await query
            .OrderByDescending(g => g.AvgRating)
            .ThenByDescending(g => g.ReviewsCount)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return items.Select(MapToSummary).ToList();
    }

    public async Task<IReadOnlyList<GameSummaryViewModel>> GetTrendingAsync(int limit, string? tag = null, CancellationToken cancellationToken = default)
    {
        var since = DateTime.UtcNow.AddDays(-1);

        var scoreQuery = _db.Scores
            .AsNoTracking()
            .Where(s => s.SubmittedAtUtc >= since);

        if (!string.IsNullOrWhiteSpace(tag))
        {
            scoreQuery = scoreQuery.Where(s => s.Game.Tags.Any(t => t.IsApproved && t.Value == tag));
        }

        var topIds = await scoreQuery
            .GroupBy(s => s.GameId)
            .OrderByDescending(g => g.Count())
            .Select(g => g.Key)
            .Take(limit)
            .ToListAsync(cancellationToken);

        if (!topIds.Any())
        {
            return await GetPopularAsync(limit, tag, cancellationToken);
        }

        var items = await CreateGameProjection()
            .Where(g => topIds.Contains(g.Id))
            .ToListAsync(cancellationToken);

        var ordered = items
            .OrderBy(g => topIds.IndexOf(g.Id))
            .Select(MapToSummary)
            .ToList();

        if (ordered.Count < limit)
        {
            var fallback = await GetPopularAsync(limit, tag, cancellationToken);
            foreach (var game in fallback)
            {
                if (ordered.Count >= limit)
                {
                    break;
                }

                if (ordered.All(existing => existing.Id != game.Id))
                {
                    ordered.Add(game);
                }
            }
        }

        return ordered;
    }

    public async Task<GameSummaryViewModel?> GetGameOfTheDayAsync(CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(_options.GameOfTheDayOverrideSlug))
        {
            var overrideGame = await CreateGameProjection()
                .FirstOrDefaultAsync(g => g.Slug == _options.GameOfTheDayOverrideSlug, cancellationToken);

            if (overrideGame is not null)
            {
                return MapToSummary(overrideGame);
            }
        }

        var now = DateTime.UtcNow;
        var scheduledFeature = await _db.HomeFeaturedGames
            .AsNoTracking()
            .Where(f => f.IsActive && f.StartsAtUtc <= now && f.EndsAtUtc >= now)
            .OrderBy(f => f.EndsAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (scheduledFeature is not null)
        {
            var projection = await CreateGameProjection()
                .FirstOrDefaultAsync(g => g.Id == scheduledFeature.GameId, cancellationToken);

            if (projection is not null)
            {
                var summary = MapToSummary(projection);
                if (!string.IsNullOrWhiteSpace(scheduledFeature.CustomDescription))
                {
                    summary.Excerpt = scheduledFeature.CustomDescription!;
                }

                return summary;
            }
        }

        var trending = await GetTrendingAsync(1, cancellationToken: cancellationToken);
        if (trending.Any())
        {
            return trending.First();
        }

        var featured = await GetFeaturedAsync(1, cancellationToken);
        return featured.FirstOrDefault();
    }

    public async Task<IReadOnlyList<TagFilterViewModel>> GetTopTagsAsync(int limit, CancellationToken cancellationToken = default)
    {
        var tags = await _db.GameTags
            .AsNoTracking()
            .Where(t => t.IsApproved)
            .GroupBy(t => t.Value)
            .Select(g => new TagFilterViewModel
            {
                Tag = g.Key,
                GameCount = g.Select(t => t.GameId).Distinct().Count()
            })
            .OrderByDescending(t => t.GameCount)
            .ThenBy(t => t.Tag)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return tags;
    }

    private IQueryable<GameProjection> CreateGameProjection()
    {
        return _db.Games
            .AsNoTracking()
            .Where(g => g.ApprovalStatus == GameApprovalStatus.Approved)
            .Select(g => new GameProjection
            {
                Id = g.Id,
                Title = g.Title,
                Slug = g.Slug,
                CoverImagePath = g.CoverImagePath,
                Description = g.Description ?? string.Empty,
                CreatedAtUtc = g.CreatedAtUtc,
                UpdatedAtUtc = g.UpdatedAtUtc,
                AvgRating = g.Reviews.Select(r => (double?)r.Stars).Average() ?? 0,
                ReviewsCount = g.Reviews.Count,
                HighlightTag = g.Tags.Where(t => t.IsApproved).OrderBy(t => t.Value).Select(t => t.Value).FirstOrDefault(),
                Tags = g.Tags.Where(t => t.IsApproved).Select(t => t.Value).ToList()
            });
    }

    private GameSummaryViewModel MapToSummary(GameProjection game)
    {
        var newThreshold = DateTime.UtcNow.AddDays(-1);
        return new GameSummaryViewModel
        {
            Id = game.Id,
            Title = game.Title,
            Slug = game.Slug,
            CoverImagePath = game.CoverImagePath,
            Excerpt = BuildExcerpt(game.Description),
            Rating = Math.Round(game.AvgRating, 1),
            ReviewsCount = game.ReviewsCount,
            HighlightTag = game.HighlightTag,
            IsNewRelease = game.CreatedAtUtc >= newThreshold
        };
    }

    private string BuildExcerpt(string? description)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            return string.Empty;
        }

        const int maxLength = 110;
        if (description.Length <= maxLength)
        {
            return description;
        }

        return description[..maxLength].TrimEnd() + "…";
    }

    private sealed class GameProjection
    {
        public Guid Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public string Slug { get; init; } = string.Empty;
        public string? CoverImagePath { get; init; }
        public string Description { get; init; } = string.Empty;
        public DateTime CreatedAtUtc { get; init; }
        public DateTime? UpdatedAtUtc { get; init; }
        public double AvgRating { get; init; }
        public int ReviewsCount { get; init; }
        public string? HighlightTag { get; init; }
        public List<string> Tags { get; init; } = new();
    }
}