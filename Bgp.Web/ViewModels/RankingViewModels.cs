using System;
using System.Collections.Generic;
using Bgp.Domain.Enums;

namespace Bgp.Web.ViewModels;

public class GlobalRankingViewModel
{
    public IReadOnlyList<GlobalRankingEntryViewModel> Entries { get; set; } = Array.Empty<GlobalRankingEntryViewModel>();
    public string? CurrentUserId { get; set; }
}

public class GlobalRankingEntryViewModel
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string RankTitle { get; set; } = string.Empty;
    public string Tier { get; set; } = string.Empty;
    public int ExperiencePoints { get; set; }
    public int Level { get; set; }
    public int Position { get; set; }
    public string? AvatarUrl { get; set; }
    public bool IsCurrentUser { get; set; }
    public string? MostPlayedGameTitle { get; set; }
    public UserPresenceStatus PresenceStatus { get; set; } = UserPresenceStatus.Offline;
    public string PresenceLabel { get; set; } = string.Empty;
    public string AccentColor { get; set; } = "#38bdf8";
    public string AccentHighlightColor { get; set; } = "#a855f7";
    public string? TrophyImage { get; set; }
    public bool IsFriend { get; set; }
    public IReadOnlyList<ExperienceBreakdownViewModel> ExperienceBreakdown { get; set; } = Array.Empty<ExperienceBreakdownViewModel>();
}

public class ExperienceBreakdownViewModel
{
    public string Label { get; set; } = string.Empty;
    public int Points { get; set; }
}

public class GlobalRankingSectionViewModel
{
    public string Title { get; set; } = string.Empty;
    public string Subtitle { get; set; } = string.Empty;
    public string RankLabel { get; set; } = string.Empty;
    public string AvatarLabel { get; set; } = string.Empty;
    public string PlayerLabel { get; set; } = string.Empty;
    public string MostPlayedGameLabel { get; set; } = string.Empty;
    public string SearchPlaceholder { get; set; } = string.Empty;
    public string FilterLabel { get; set; } = string.Empty;
    public string FilterAllLabel { get; set; } = string.Empty;
    public string LevelLabel { get; set; } = string.Empty;
    public string ExperienceLabel { get; set; } = string.Empty;
    public string RankTitleLabel { get; set; } = string.Empty;
    public string RankTitleUnknownLabel { get; set; } = string.Empty;
    public string EmptyLabel { get; set; } = string.Empty;
    public string ActionsLabel { get; set; } = string.Empty;
    public string ActionsMessage { get; set; } = string.Empty;
    public string ActionsAddFriend { get; set; } = string.Empty;
    public string ActionsRemoveFriend { get; set; } = string.Empty;
    public string ActionsViewProfile { get; set; } = string.Empty;
    public string ActionsInvite { get; set; } = string.Empty;
    public string ActionsMoreLabel { get; set; } = string.Empty;
    public string ActionsBlock { get; set; } = string.Empty;
    public string ActionsBlockConfirm { get; set; } = string.Empty;
    public string ActionsBlockSuccess { get; set; } = string.Empty;
    public string ActionsBlockError { get; set; } = string.Empty;
    public string ActionsReport { get; set; } = string.Empty;
    public string ActionsReportPrompt { get; set; } = string.Empty;
    public string ActionsReportSuccess { get; set; } = string.Empty;
    public string ActionsReportError { get; set; } = string.Empty;
    public string JumpToMeLabel { get; set; } = string.Empty;
    public string SelfBadgeLabel { get; set; } = string.Empty;

    public string AnchorId { get; set; } = "global-ranking";
    public GlobalRankingViewModel Data { get; set; } = new();
}