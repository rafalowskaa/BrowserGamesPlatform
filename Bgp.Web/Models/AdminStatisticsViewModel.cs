using System;
using System.Collections.Generic;

namespace Bgp.Web.Models;

public class AdminStatisticsViewModel
{
    public AdminStatisticsFilterViewModel Filter { get; init; } = new();
    public AdminStatisticsTotalsViewModel Totals { get; init; } = new();
    public AdminStatisticsTotalsViewModel? PreviousTotals { get; init; }
    public IReadOnlyList<AdminStatisticsSeriesPoint> Series { get; init; } = Array.Empty<AdminStatisticsSeriesPoint>();
    public IReadOnlyList<AdminStatisticsSeriesPoint> PreviousSeries { get; init; } = Array.Empty<AdminStatisticsSeriesPoint>();
    public IReadOnlyList<AdminStatisticsHeatmapRow> HeatmapRows { get; init; } = Array.Empty<AdminStatisticsHeatmapRow>();
    public IReadOnlyList<AdminStatisticsInsight> Insights { get; init; } = Array.Empty<AdminStatisticsInsight>();
    public IReadOnlyList<AdminStatisticsTopDay> TopDays { get; init; } = Array.Empty<AdminStatisticsTopDay>();
    public IReadOnlyList<AdminStatisticsTopGame> TopGames { get; init; } = Array.Empty<AdminStatisticsTopGame>();
    public IReadOnlyList<AdminStatisticsNewGame> NewGames { get; init; } = Array.Empty<AdminStatisticsNewGame>();
    public IReadOnlyList<AdminStatisticsReportReason> ReportsByReason { get; init; } = Array.Empty<AdminStatisticsReportReason>();
    public IReadOnlyList<AdminStatisticsRatingBucket> RatingDistribution { get; init; } = Array.Empty<AdminStatisticsRatingBucket>();
}

public class AdminStatisticsFilterViewModel
{
    public string RangePreset { get; init; } = "30d";
    public string Granularity { get; init; } = "day";
    public bool CompareEnabled { get; init; }
    public bool ShowInactiveDays { get; init; }
    public DateTime StartDate { get; init; }
    public DateTime EndDate { get; init; }
    public string RangeLabel { get; init; } = string.Empty;
}

public class AdminStatisticsTotalsViewModel
{
    public int ActiveUsers { get; init; }
    public int Logins { get; init; }
    public int GamesPlayed { get; init; }
    public int Comments { get; init; }
    public int Ratings { get; init; }
    public int GamesPublished { get; init; }
    public int Reports { get; init; }
}

public record AdminStatisticsSeriesPoint
{
    public DateTime PeriodStart { get; init; }
    public int ActiveUsers { get; init; }
    public int Logins { get; init; }
    public int GamesPlayed { get; init; }
    public int Comments { get; init; }
    public int Ratings { get; init; }
    public int GamesPublished { get; init; }
    public int Reports { get; init; }
}

public class AdminStatisticsHeatmapRow
{
    public DateTime PeriodStart { get; init; }
    public int Logins { get; init; }
    public int GamesPlayed { get; init; }
    public int Comments { get; init; }
    public int Ratings { get; init; }
    public int GamesPublished { get; init; }
}

public record AdminStatisticsInsight(string Title, string Description, string Tone);

public record AdminStatisticsTopDay(DateTime PeriodStart, int TotalActivity);

public record AdminStatisticsTopGame(Guid GameId, string Title, int Plays, int Ratings, int Comments);

public record AdminStatisticsNewGame(Guid GameId, string Title, DateTime PublishedAtUtc);

public record AdminStatisticsReportReason(string Reason, int Total);

public record AdminStatisticsRatingBucket(int Stars, int Total);