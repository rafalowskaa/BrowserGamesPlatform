using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Bgp.Web.Resources;
using Bgp.Web.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.Controllers;

[AllowAnonymous]
public class HomeController : Controller
{
    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IStringLocalizer<SharedResource> _localizer;

    public HomeController(AppDbContext db, UserManager<ApplicationUser> userManager, IStringLocalizer<SharedResource> localizer)
    {
        _db = db;
        _userManager = userManager;
        _localizer = localizer;
    }

    public async Task<IActionResult> Index()
    {
        var model = User?.Identity?.IsAuthenticated == true
            ? await BuildAuthenticatedViewModel()
            : await BuildGuestViewModel();

        return View(model);
    }

    public IActionResult Policy() => View();

    private async Task<HomeViewModel> BuildGuestViewModel()
    {
        var featured = await FetchFeaturedGamesAsync(6);
        var top = await FetchTopGamesAsync(12);
        var tags = await FetchPopularTagsAsync(12);

        return new HomeViewModel
        {
            IsAuthenticated = false,
            Hero = new HeroViewModel
            {
                Title = _localizer["Home_Hero_Title"].Value,
                Subtitle = _localizer["Home_Hero_Subtitle"].Value,
                BackgroundImage = "/img/branding/hero-collage.svg"
            },
            GameOfTheDay = featured.FirstOrDefault(),
            FeaturedGames = featured,
            TopGames = top,
            TopTags = tags,
            WeeklyEvents = GenerateWeeklyEvents(),
            CommunityMetrics = await BuildCommunityMetricsAsync()
        };
    }

    private async Task<HomeViewModel> BuildAuthenticatedViewModel()
    {
        var baseModel = await BuildGuestViewModel();
        baseModel.IsAuthenticated = true;

        baseModel.ContinuePlaying = await FetchRecentSessionsAsync(3);
        baseModel.ForYou = await FetchPersonalisedGamesAsync(6);
        baseModel.Trending = await FetchTrendingGamesAsync(6);
        baseModel.FriendActivity = await FetchFriendActivityAsync(6);
        baseModel.CreatorHighlights = await FetchCreatorHighlightsAsync(3);
        baseModel.ExperiencePanel = await BuildExperiencePanelAsync();
        baseModel.DailyChallenges = FetchDailyChallengesFallback();

        return baseModel;
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
                HighlightTag = g.Tags.Where(t => t.IsApproved).OrderBy(t => t.Value).Select(t => t.Value).FirstOrDefault()
            });
    }

    private async Task<IReadOnlyList<GameSummaryViewModel>> FetchFeaturedGamesAsync(int limit)
    {
        var items = await CreateGameProjection()
            .OrderByDescending(g => g.CreatedAtUtc)
            .ThenByDescending(g => g.AvgRating)
            .Take(limit)
            .ToListAsync();

        return items.Select(MapToSummary).ToList();
    }

    private async Task<IReadOnlyList<GameSummaryViewModel>> FetchTopGamesAsync(int limit)
    {
        var items = await CreateGameProjection()
            .OrderByDescending(g => g.AvgRating)
            .ThenByDescending(g => g.ReviewsCount)
            .Take(limit)
            .ToListAsync();

        return items.Select(MapToSummary).ToList();
    }

    private async Task<IReadOnlyList<GameSummaryViewModel>> FetchPersonalisedGamesAsync(int limit)
    {
        var items = await CreateGameProjection()
            .OrderByDescending(g => g.UpdatedAtUtc ?? g.CreatedAtUtc)
            .ThenByDescending(g => g.AvgRating)
            .Take(limit)
            .ToListAsync();

        return items.Select(MapToSummary).ToList();
    }

    private async Task<IReadOnlyList<GameSummaryViewModel>> FetchTrendingGamesAsync(int limit)
    {
        var since = DateTime.UtcNow.AddDays(-1);
        var topIds = await _db.Scores
            .AsNoTracking()
            .Where(s => s.SubmittedAtUtc >= since)
            .GroupBy(s => s.GameId)
            .OrderByDescending(g => g.Count())
            .Select(g => g.Key)
            .Take(limit)
            .ToListAsync();

        if (!topIds.Any())
        {
            return await FetchTopGamesAsync(limit);
        }

        var items = await CreateGameProjection()
            .Where(g => topIds.Contains(g.Id))
            .ToListAsync();

        return items.Select(MapToSummary).ToList();
    }

    private async Task<IReadOnlyList<GameSummaryViewModel>> FetchCreatorHighlightsAsync(int limit)
    {
        var items = await CreateGameProjection()
            .OrderByDescending(g => g.UpdatedAtUtc ?? g.CreatedAtUtc)
            .Take(limit)
            .ToListAsync();

        return items.Select(MapToSummary).ToList();
    }

    private async Task<IReadOnlyList<GameSummaryViewModel>> FetchRecentSessionsAsync(int limit)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
        {
            return Array.Empty<GameSummaryViewModel>();
        }

        var recentIds = await _db.Scores
            .AsNoTracking()
            .Where(s => s.UserId == user.Id)
            .OrderByDescending(s => s.SubmittedAtUtc)
            .Select(s => s.GameId)
            .Distinct()
            .Take(limit)
            .ToListAsync();

        if (!recentIds.Any())
        {
            return Array.Empty<GameSummaryViewModel>();
        }

        var items = await CreateGameProjection()
            .Where(g => recentIds.Contains(g.Id))
            .ToListAsync();

        return items.Select(MapToSummary).ToList();
    }

    private async Task<IReadOnlyList<TagFilterViewModel>> FetchPopularTagsAsync(int limit)
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
            .ToListAsync();

        return tags;
    }

    private async Task<CommunityMetricsViewModel> BuildCommunityMetricsAsync()
    {
        var gamesCount = await _db.Games.CountAsync(g => g.ApprovalStatus == GameApprovalStatus.Approved);
        var playersCount = await _db.Users.CountAsync();

        return new CommunityMetricsViewModel
        {
            GamesCount = gamesCount,
            PlayersCount = playersCount
        };
    }

    private async Task<IReadOnlyList<ActivityFeedItemViewModel>> FetchFriendActivityAsync(int limit)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
        {
            return Array.Empty<ActivityFeedItemViewModel>();
        }

        var friendIds = await _db.Friendships
            .AsNoTracking()
            .Where(f => f.Status == FriendshipStatus.Accepted && (f.RequesterId == user.Id || f.AddresseeId == user.Id))
            .Select(f => f.RequesterId == user.Id ? f.AddresseeId : f.RequesterId)
            .Distinct()
            .ToListAsync();

        if (!friendIds.Any())
        {
            return Array.Empty<ActivityFeedItemViewModel>();
        }

        var feed = await _db.Scores
            .AsNoTracking()
            .Where(s => friendIds.Contains(s.UserId))
            .OrderByDescending(s => s.SubmittedAtUtc)
            .Take(limit)
            .Join(_db.Users.AsNoTracking(), s => s.UserId, u => u.Id, (s, u) => new { s, u })
            .Join(_db.Games.AsNoTracking(), su => su.s.GameId, g => g.Id, (su, g) => new ActivityFeedItemViewModel
            {
                ActorName = DisplayNameFormatter.Format(su.u.DisplayName, su.u.Email, su.u.UserName, su.u.Id),
                Action = _localizer["Home_FriendActivity_Action"].Value,
                TargetName = g.Title,
                TargetSlug = g.Slug,
                When = su.s.SubmittedAtUtc
            })
            .ToListAsync();

        return feed;
    }

    private ExperiencePanelViewModel BuildExperiencePanel(int xp)
    {
        var rankName = xp switch
        {
            >= 500 => _localizer["Home_Rank_Grandmaster"].Value,
            >= 200 => _localizer["Home_Rank_Veteran"].Value,
            >= 50 => _localizer["Home_Rank_Adept"].Value,
            _ => _localizer["Home_Rank_Novice"].Value
        };

        var nextThreshold = xp switch
        {
            < 50 => 50,
            < 200 => 200,
            < 500 => 500,
            _ => xp + 100
        };

        var progressPercent = nextThreshold == 0 ? 100 : Math.Clamp((int)Math.Round(xp / (double)nextThreshold * 100), 0, 100);

        return new ExperiencePanelViewModel
        {
            RankName = rankName,
            CurrentXp = xp,
            ProgressPercent = progressPercent,
            XpToNext = Math.Max(0, nextThreshold - xp)
        };
    }

    private async Task<ExperiencePanelViewModel> BuildExperiencePanelAsync()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
        {
            return new ExperiencePanelViewModel();
        }

        var xp = await _db.Scores.CountAsync(s => s.UserId == user.Id) * 10;
        return BuildExperiencePanel(xp);
    }

    private IReadOnlyList<DailyChallengeViewModel> FetchDailyChallengesFallback()
    {
        return new List<DailyChallengeViewModel>
        {
           new() { Key = "challenge-play", Title = _localizer["Home_Challenge_Play"].Value, RewardXp = 10, IsCompleted = false },
            new() { Key = "challenge-rate", Title = _localizer["Home_Challenge_Rate"].Value, RewardXp = 10, IsCompleted = false },
            new() { Key = "challenge-share", Title = _localizer["Home_Challenge_Share"].Value, RewardXp = 10, IsCompleted = false }
        };
    }

    private IReadOnlyList<EventHighlightViewModel> GenerateWeeklyEvents()
    {
        var now = DateTime.UtcNow;
        return new List<EventHighlightViewModel>
        {
            new() { Title = _localizer["Home_Event_TournamentSprint_Title"].Value, Reward = _localizer["Home_Event_TournamentSprint_Reward"].Value, EndsAt = now.AddDays(3) },
            new() { Title = _localizer["Home_Event_CreatorBattle_Title"].Value, Reward = _localizer["Home_Event_CreatorBattle_Reward"].Value, EndsAt = now.AddDays(5) },
            new() { Title = _localizer["Home_Event_RankedMarathon_Title"].Value, Reward = _localizer["Home_Event_RankedMarathon_Reward"].Value, EndsAt = now.AddDays(7) }
        };
    }

    private static GameSummaryViewModel MapToSummary(GameProjection game)
    {
        return new GameSummaryViewModel
        {
            Id = game.Id,
            Title = game.Title,
            Slug = game.Slug,
            CoverImagePath = game.CoverImagePath,
            Excerpt = BuildExcerpt(game.Description),
            Rating = Math.Round(game.AvgRating, 1),
            HighlightTag = game.HighlightTag
        };
    }

    private static string BuildExcerpt(string? description)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            return string.Empty;
        }

        return description.Length > 140 ? description[..140] + "…" : description;
    }


    private record GameProjection
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
    }
}
