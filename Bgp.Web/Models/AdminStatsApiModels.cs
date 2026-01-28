using System;
using System.Collections.Generic;

namespace Bgp.Web.Models;

public class AdminStatsRangeDto
{
    public DateTime Start { get; init; }
    public DateTime End { get; init; }
    public string Granularity { get; init; } = "day";
    public string Timezone { get; init; } = TimeZoneInfo.Local.Id;
}

public class AdminStatsCompareDto
{
    public bool Enabled { get; init; }
    public DateTime? PrevStart { get; init; }
    public DateTime? PrevEnd { get; init; }
}

public class AdminStatsTotalsDto
{
    public int ActiveUsers { get; init; }
    public int Logins { get; init; }
    public int GamesPlayed { get; init; }
    public int Comments { get; init; }
    public int Ratings { get; init; }
    public int GamesPublished { get; init; }
    public int Reports { get; init; }
    public double AverageRating { get; init; }
}

public class AdminStatsDeltaDto
{
    public double ActiveUsers { get; init; }
    public double Logins { get; init; }
    public double GamesPlayed { get; init; }
    public double Comments { get; init; }
    public double Ratings { get; init; }
    public double GamesPublished { get; init; }
    public double Reports { get; init; }
    public double AverageRating { get; init; }
}

public class AdminStatsSeriesBucketDto
{
    public DateTime Bucket { get; init; }
    public int ActiveUsers { get; init; }
    public int Logins { get; init; }
    public int GamesPlayed { get; init; }
    public int Comments { get; init; }
    public int Ratings { get; init; }
    public int GamesPublished { get; init; }
    public int Reports { get; init; }
}

public class AdminStatsHeatmapBucketDto
{
    public DateTime Bucket { get; init; }
    public int Logins { get; init; }
    public int GamesPlayed { get; init; }
    public int Comments { get; init; }
    public int Ratings { get; init; }
    public int GamesPublished { get; init; }
}

public class AdminStatsSummaryResponse
{
    public AdminStatsRangeDto Range { get; init; } = new();
    public AdminStatsCompareDto Compare { get; init; } = new();
    public AdminStatsTotalsDto Totals { get; init; } = new();
    public AdminStatsDeltaDto? DeltasPct { get; init; }
    public IReadOnlyList<AdminStatisticsInsight> Insights { get; init; } = Array.Empty<AdminStatisticsInsight>();
}

public class AdminStatsSeriesResponse
{
    public AdminStatsRangeDto Range { get; init; } = new();
    public AdminStatsCompareDto Compare { get; init; } = new();
    public IReadOnlyList<AdminStatsSeriesBucketDto> Series { get; init; } = Array.Empty<AdminStatsSeriesBucketDto>();
    public IReadOnlyList<AdminStatsSeriesBucketDto> PreviousSeries { get; init; } = Array.Empty<AdminStatsSeriesBucketDto>();
}

public class AdminStatsHeatmapResponse
{
    public AdminStatsRangeDto Range { get; init; } = new();
    public bool ShowInactiveDays { get; init; }
    public IReadOnlyList<AdminStatsHeatmapBucketDto> Heatmap { get; init; } = Array.Empty<AdminStatsHeatmapBucketDto>();
}

public class AdminStatsTopResponse
{
    public AdminStatsRangeDto Range { get; init; } = new();
    public IReadOnlyList<AdminStatisticsTopDay> TopDays { get; init; } = Array.Empty<AdminStatisticsTopDay>();
    public IReadOnlyList<AdminStatisticsTopGame> TopGames { get; init; } = Array.Empty<AdminStatisticsTopGame>();
    public IReadOnlyList<AdminStatisticsNewGame> NewGames { get; init; } = Array.Empty<AdminStatisticsNewGame>();
    public IReadOnlyList<AdminStatisticsReportReason> ReportsByReason { get; init; } = Array.Empty<AdminStatisticsReportReason>();
    public IReadOnlyList<AdminStatisticsRatingBucket> RatingDistribution { get; init; } = Array.Empty<AdminStatisticsRatingBucket>();
}

public class AdminStatsDrilldownResponse
{
    public AdminStatsRangeDto Range { get; init; } = new();
    public AdminStatsTotalsDto Totals { get; init; } = new();
    public IReadOnlyList<AdminStatisticsTopGame> TopGames { get; init; } = Array.Empty<AdminStatisticsTopGame>();
    public IReadOnlyList<AdminStatisticsTopGame> TopCommented { get; init; } = Array.Empty<AdminStatisticsTopGame>();
    public IReadOnlyList<AdminStatisticsRatingBucket> RatingDistribution { get; init; } = Array.Empty<AdminStatisticsRatingBucket>();
}