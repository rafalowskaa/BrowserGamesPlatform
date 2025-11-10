using System;
using System.Collections.Generic;
using System.Linq;
using Bgp.Domain.Enums;

namespace Bgp.Web.Models;

public class AdminReportsViewModel
{
    public IReadOnlyList<ReportRow> Reports { get; init; } = Array.Empty<ReportRow>();
    public IReadOnlyList<StatusSummary> StatusSummaries { get; init; } = Array.Empty<StatusSummary>();
    public string? Search { get; init; }
    public ReportStatus? StatusFilter { get; init; }

    public int TotalReports => Reports.Count;

    public int CountFor(ReportStatus status)
        => StatusSummaries.FirstOrDefault(s => s.Status == status)?.Count ?? 0;

    public sealed record StatusSummary(ReportStatus Status, int Count);

    public sealed record ReportRow(
        Guid Id,
        DateTime CreatedAtUtc,
        string ReporterUserId,
        string ReporterDisplayName,
        string TargetUserId,
        string TargetDisplayName,
        ReportCategory Category,
        string? Description,
        ReportStatus Status);
}