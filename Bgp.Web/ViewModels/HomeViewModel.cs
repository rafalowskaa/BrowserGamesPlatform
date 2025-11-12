using System;
using System.Collections.Generic;

namespace Bgp.Web.ViewModels;

public class HomeViewModel
{
    public bool IsAuthenticated { get; set; }
    public HeroViewModel Hero { get; set; } = new();
    public IReadOnlyList<GameSummaryViewModel> FeaturedGames { get; set; } = new List<GameSummaryViewModel>();
    public IReadOnlyList<GameSummaryViewModel> TopGames { get; set; } = new List<GameSummaryViewModel>();
    public IReadOnlyList<TagFilterViewModel> TopTags { get; set; } = new List<TagFilterViewModel>();
    public IReadOnlyList<GameSummaryViewModel> ContinuePlaying { get; set; } = new List<GameSummaryViewModel>();
    public IReadOnlyList<GameSummaryViewModel> ForYou { get; set; } = new List<GameSummaryViewModel>();
    public IReadOnlyList<GameSummaryViewModel> Trending { get; set; } = new List<GameSummaryViewModel>();
    public IReadOnlyList<ActivityFeedItemViewModel> FriendActivity { get; set; } = new List<ActivityFeedItemViewModel>();
    public IReadOnlyList<GameSummaryViewModel> CreatorHighlights { get; set; } = new List<GameSummaryViewModel>();
    public ExperiencePanelViewModel ExperiencePanel { get; set; } = new();
    public IReadOnlyList<DailyChallengeViewModel> DailyChallenges { get; set; } = new List<DailyChallengeViewModel>();
    public CommunityMetricsViewModel CommunityMetrics { get; set; } = new();
    public IReadOnlyList<EventHighlightViewModel> WeeklyEvents { get; set; } = new List<EventHighlightViewModel>();
    public GameSummaryViewModel? GameOfTheDay { get; set; }
}

public class HeroViewModel
{
    public string Title { get; set; } = string.Empty;
    public string Subtitle { get; set; } = string.Empty;
    public string? BackgroundImage { get; set; }
}

public class GameSummaryViewModel
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? CoverImagePath { get; set; }
    public string Excerpt { get; set; } = string.Empty;
    public double Rating { get; set; }
    public string? HighlightTag { get; set; }
}

public class TagFilterViewModel
{
    public string Tag { get; set; } = string.Empty;
    public int GameCount { get; set; }
}

public class ActivityFeedItemViewModel
{
    public string ActorName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string TargetName { get; set; } = string.Empty;
    public string TargetSlug { get; set; } = string.Empty;
    public DateTime When { get; set; }
}

public class ExperiencePanelViewModel
{
    public string RankName { get; set; } = string.Empty;
    public int CurrentXp { get; set; }
    public int ProgressPercent { get; set; }
    public int XpToNext { get; set; }
}

public class DailyChallengeViewModel
{
    public string Key { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public bool IsCompleted { get; set; }
    public int RewardXp { get; set; }
}

public class CommunityMetricsViewModel
{
    public int GamesCount { get; set; }
    public int PlayersCount { get; set; }
}

public class EventHighlightViewModel
{
    public string Title { get; set; } = string.Empty;
    public string Reward { get; set; } = string.Empty;
    public DateTime EndsAt { get; set; }
}