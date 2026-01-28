using System;
using System.Collections.Generic;

namespace Bgp.Web.Models;

public class StatsPageVm
{
    public StatsFilterVm Filter { get; init; } = new();
    public IReadOnlyList<KpiCardVm> Kpis { get; init; } = Array.Empty<KpiCardVm>();
    public string Timezone { get; init; } = TimeZoneInfo.Local.Id;
}

public class StatsFilterVm
{
    public string RangePreset { get; init; } = "30d";
    public string Granularity { get; init; } = "day";
    public bool CompareEnabled { get; init; }
    public bool ShowInactiveDays { get; init; }
    public DateTime StartDate { get; init; }
    public DateTime EndDate { get; init; }
    public string RangeLabel { get; init; } = string.Empty;
}

public class KpiCardVm
{
    public string Key { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
    public string? Tooltip { get; init; }
}

public class InsightVm
{
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string Tone { get; init; } = "neutral";
}

public class TopGameVm
{
    public Guid GameId { get; init; }
    public string Title { get; init; } = string.Empty;
    public int Plays { get; init; }
    public int Ratings { get; init; }
    public int Comments { get; init; }
}

public class BucketRowVm
{
    public DateTime PeriodStart { get; init; }
    public int Logins { get; init; }
    public int GamesPlayed { get; init; }
    public int Comments { get; init; }
    public int Ratings { get; init; }
    public int GamesPublished { get; init; }
}