using System;
using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Web.Models;

public class AdminLogRowViewModel
{
    public Guid Id { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public ActivityLogType Type { get; init; }
    public string? ActorUserId { get; init; }
    public string? ActorDisplayName { get; init; }
    public string? TargetUserId { get; init; }
    public string? TargetDisplayName { get; init; }
    public Guid? GameId { get; init; }
    public string? GameSlug { get; init; }
    public string? GameTitle { get; init; }
    public int? Rating { get; init; }
    public string? Message { get; init; }
}

public class AdminLogsViewModel
{
    public IEnumerable<AdminLogRowViewModel> Logs { get; init; } = Array.Empty<AdminLogRowViewModel>();
    public AdminActivityOverviewViewModel ActivityOverview { get; init; } = new();

    public string? Search { get; init; }

    [Display(Name = "Type")]
    public ActivityLogType? Type { get; init; }

    public string? Game { get; init; }

    [Display(Name = "DateFrom")]
    public DateTime? DateFrom { get; init; }

    [Display(Name = "DateTo")]
    public DateTime? DateTo { get; init; }
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 50;
    public int Total { get; init; }
}

public class AdminActivityOverviewViewModel
{
    public AdminActivityMetricTotals Logins { get; init; } = new();
    public AdminActivityMetricTotals GamesPlayed { get; init; } = new();
    public AdminActivityMetricTotals Comments { get; init; } = new();
    public AdminActivityMetricTotals Ratings { get; init; } = new();
    public IReadOnlyList<AdminActivitySeriesPoint> Last7Days { get; init; } = Array.Empty<AdminActivitySeriesPoint>();
}

public class AdminActivityMetricTotals
{
    public int Today { get; init; }
    public int Last7Days { get; init; }
    public int Last30Days { get; init; }
    public int Last365Days { get; init; }
}

public class AdminActivitySeriesPoint
{
    public DateTime Date { get; init; }
    public int Logins { get; init; }
    public int GamesPlayed { get; init; }
    public int Comments { get; init; }
    public int Ratings { get; init; }
}