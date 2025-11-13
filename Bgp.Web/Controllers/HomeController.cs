using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Bgp.Web.Models;
using Bgp.Web.Resources;
using Bgp.Web.ViewModels;
using GameSummaryViewModel = Bgp.Web.ViewModels.GameSummaryViewModel;
using Bgp.Web.Services;
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
    private readonly HomeContentService _homeContentService;

    public HomeController(
        AppDbContext db,
        UserManager<ApplicationUser> userManager,
        IStringLocalizer<SharedResource> localizer,
        HomeContentService homeContentService)
    {
        _db = db;
        _userManager = userManager;
        _localizer = localizer;
        _homeContentService = homeContentService;
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
        var featured = await _homeContentService.GetFeaturedAsync(8);
        var trending = await _homeContentService.GetTrendingAsync(8);
        var tags = await _homeContentService.GetTopTagsAsync(7);
        var gameOfTheDay = await _homeContentService.GetGameOfTheDayAsync() ?? featured.FirstOrDefault();
        var facts = await GetHomeFactsAsync();
        var weeklyEvents = await GetWeeklyEventsAsync();

        return new HomeViewModel
        {
            IsAuthenticated = false,
            Hero = new HeroViewModel
            {
                Title = _localizer["Home_Hero_Headline"].Value,
                Subtitle = _localizer["Home_Hero_Description"].Value,
                BackgroundImage = "/img/branding/hero-collage.svg",
                Fact = SelectDailyHeroFact(facts)
            },
            GameOfTheDay = gameOfTheDay,
            FeaturedGames = featured,
            TopGames = trending,
            TopTags = tags,
            WeeklyEvents = weeklyEvents,
            FunFacts = facts,
            CommunityMetrics = await BuildCommunityMetricsAsync()
        };
    }

    private async Task<HomeViewModel> BuildAuthenticatedViewModel()
    {
        var baseModel = await BuildGuestViewModel();
        baseModel.IsAuthenticated = true;

        baseModel.ContinuePlaying = await FetchRecentSessionsAsync(3);
        baseModel.ForYou = await FetchPersonalisedGamesAsync(6);
        baseModel.Trending = await _homeContentService.GetTrendingAsync(6);
        baseModel.FriendActivity = await FetchFriendActivityAsync(6);
        baseModel.CreatorHighlights = await FetchCreatorHighlightsAsync(3);
        baseModel.ExperiencePanel = await BuildExperiencePanelAsync();
        baseModel.DailyChallenges = FetchDailyChallengesFallback();

        return baseModel;
    }

    private async Task<IReadOnlyList<string>> GetHomeFactsAsync()
    {
        var facts = await _db.HomeFacts
            .AsNoTracking()
            .Where(f => f.IsActive)
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.Id)
            .Select(f => f.Content)
            .Where(content => !string.IsNullOrWhiteSpace(content))
            .ToListAsync();

        return facts;
    }

    private string SelectDailyHeroFact(IReadOnlyList<string> facts)
    {
        if (facts is null || facts.Count == 0)
        {
            return string.Empty;
        }

        var seed = HashCode.Combine(DateTime.UtcNow.Year, DateTime.UtcNow.DayOfYear);
        var index = Math.Abs(seed) % facts.Count;
        return facts[index];
    }

    private async Task<IReadOnlyList<EventHighlightViewModel>> GetWeeklyEventsAsync()
    {
        var events = await _db.HomeEvents
            .AsNoTracking()
            .Where(e => e.IsActive)
            .OrderBy(e => e.SortOrder)
            .ThenBy(e => e.Id)
            .Select(e => new EventHighlightViewModel
            {
                Title = e.Title,
                Reward = e.Reward,
                EndsAt = e.EndsAtUtc
            })
            .ToListAsync();

        return events;
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

    private async Task<IReadOnlyList<GameSummaryViewModel>> FetchPersonalisedGamesAsync(int limit)
    {
        var items = await CreateGameProjection()
            .OrderByDescending(g => g.UpdatedAtUtc ?? g.CreatedAtUtc)
            .ThenByDescending(g => g.AvgRating)
            .Take(limit)
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
            .Join(
                _db.Games
                    .AsNoTracking()
                    .Where(g => g.ApprovalStatus == GameApprovalStatus.Approved),
                su => su.s.GameId,
                g => g.Id,
                (su, g) => new ActivityFeedItemViewModel
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

    private ExperiencePanelViewModel BuildExperiencePanel(ProfileRankViewModel rank)
    {
        

        return new ExperiencePanelViewModel
        {
            RankName = rank.DisplayName,
            NextRankName = rank.NextDisplayName,
            CurrentXp = rank.ExperiencePoints,
            CurrentThreshold = rank.CurrentThreshold,
            NextThreshold = rank.NextThreshold,
            XpIntoCurrent = rank.XpIntoCurrent,
            ProgressPercent = rank.ProgressPercent,
            XpToNext = rank.XpRequiredForNext,
            TrophyImage = rank.TrophyImage,
            AccentColor = rank.AccentColor,
            AccentHighlightColor = rank.AccentHighlightColor,
            AccentGlowColor = rank.AccentGlowColor
        };
    }

    private async Task<ExperiencePanelViewModel> BuildExperiencePanelAsync()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
        {
            return new ExperiencePanelViewModel();
        }

        var stats = await BuildUserStatsSnapshotAsync(user);
        var rank = RankCalculator.CalculateRank(stats);
        return BuildExperiencePanel(rank);
    }

    private async Task<DashboardStatsViewModel> BuildUserStatsSnapshotAsync(ApplicationUser user)
    {
        var stats = new DashboardStatsViewModel
        {
            UploadedGames = await _db.Games.CountAsync(g => g.CreatedByUserId == user.Id),
            TotalScores = await _db.Scores.CountAsync(s => s.UserId == user.Id),
            TotalReviews = await _db.GameReviews.CountAsync(r => r.UserId == user.Id),
            FriendsCount = await _db.Friendships.CountAsync(f =>
                f.Status == FriendshipStatus.Accepted &&
                (f.RequesterId == user.Id || f.AddresseeId == user.Id))
        };

        var userScoreGroups = await _db.Scores
            .AsNoTracking()
            .Where(s => s.UserId == user.Id)
            .GroupBy(s => s.GameId)
            .Select(g => new
            {
                GameId = g.Key,
                PlayCount = g.Count(),
                BestScore = g.Max(x => x.Value),
                LastPlayedAt = g.Max(x => x.SubmittedAtUtc)
            })
            .ToListAsync();

        if (userScoreGroups.Count > 0)
        {
            var gameIds = userScoreGroups.Select(g => g.GameId).ToArray();

            var gameTitles = await _db.Games
                .AsNoTracking()
                .Where(g => gameIds.Contains(g.Id))
                .Select(g => new { g.Id, g.Title })
                .ToDictionaryAsync(g => g.Id, g => g.Title ?? string.Empty);

            var bestScores = await _db.Scores
                .AsNoTracking()
                .Where(s => gameIds.Contains(s.GameId))
                .GroupBy(s => new { s.GameId, s.UserId })
                .Select(g => new
                {
                    g.Key.GameId,
                    g.Key.UserId,
                    BestScore = g.Max(x => x.Value)
                })
                .ToListAsync();

            var performances = new List<GamePerformanceStat>(userScoreGroups.Count);

            foreach (var entry in userScoreGroups)
            {
                var scoreboard = bestScores
                    .Where(bs => bs.GameId == entry.GameId)
                    .OrderByDescending(bs => bs.BestScore)
                    .ToList();

                var totalPlayers = Math.Max(1, scoreboard.Count);
                var rankPosition = scoreboard.FindIndex(bs => bs.UserId == user.Id) + 1;
                if (rankPosition <= 0)
                {
                    rankPosition = totalPlayers;
                }

                var title = gameTitles.TryGetValue(entry.GameId, out var name) ? name : string.Empty;

                performances.Add(new GamePerformanceStat(
                    entry.GameId,
                    title,
                    entry.PlayCount,
                    entry.BestScore,
                    rankPosition,
                    totalPlayers,
                    entry.LastPlayedAt));
            }

            if (performances.Count > 0)
            {
                stats.GamePerformances = performances;
                stats.LastScoreSubmittedAt = performances.Max(p => p.LastPlayedAt);
            }
        }

        if (stats.LastScoreSubmittedAt is null && userScoreGroups.Count > 0)
        {
            stats.LastScoreSubmittedAt = userScoreGroups.Max(g => g.LastPlayedAt);
        }

        return stats;
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

    private static GameSummaryViewModel MapToSummary(GameProjection game)
    {
        var isNewRelease = game.CreatedAtUtc >= DateTime.UtcNow.AddDays(-1);

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
            IsNewRelease = isNewRelease
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
