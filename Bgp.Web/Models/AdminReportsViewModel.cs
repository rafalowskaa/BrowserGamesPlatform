using System;
using System.Collections.Generic;
using System.Linq;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;

namespace Bgp.Web.Models;

public class AdminReportsViewModel
{
    public IReadOnlyList<Report> Reports { get; init; } = Array.Empty<Report>();
    public IReadOnlyList<StatusSummary> StatusSummaries { get; init; } = Array.Empty<StatusSummary>();
    public string? Search { get; init; }
    public ReportStatus? StatusFilter { get; init; }

    public int TotalReports => Reports.Count;

    public int CountFor(ReportStatus status)
        => StatusSummaries.FirstOrDefault(s => s.Status == status)?.Count ?? 0;

    public sealed record StatusSummary(ReportStatus Status, int Count);
}