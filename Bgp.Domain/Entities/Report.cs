using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Domain.Entities;

public class Report
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required] public string ReporterUserId { get; set; } = string.Empty;
    [Required] public string TargetUserId { get; set; } = string.Empty;

    public ReportCategory Category { get; set; } = ReportCategory.Other;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public ReportStatus Status { get; set; } = ReportStatus.Open;
}
