using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Application.Dtos;

public class CreateReportDto
{
    [Required] public string TargetUserId { get; set; } = string.Empty;
    public ReportCategory Category { get; set; } = ReportCategory.Other;
    [MaxLength(2000)] public string? Description { get; set; }
}

public class UpdateReportStatusDto
{
    public ReportStatus Status { get; set; } = ReportStatus.Actioned;
}
