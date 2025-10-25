using Bgp.Infrastructure.Persistence;
using System;
using System.Linq;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers;

[Authorize(Roles = "Admin")]
public class AdminUiController : Controller
{
    private readonly AppDbContext _db;
    public AdminUiController(AppDbContext db) => _db = db;

    public async Task<IActionResult> Reports(string? status = null, string? search = null)
    {
        var reportsQuery = _db.Reports.AsQueryable();

        ReportStatus? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ReportStatus>(status, true, out var parsedStatus))
        {
            statusFilter = parsedStatus;
            reportsQuery = reportsQuery.Where(r => r.Status == parsedStatus);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            reportsQuery = reportsQuery.Where(r =>
                EF.Functions.Like(r.ReporterUserId, term) ||
                EF.Functions.Like(r.TargetUserId, term) ||
                EF.Functions.Like(r.Description ?? string.Empty, term) ||
                EF.Functions.Like(r.Category.ToString(), term));
        }

        var reports = await reportsQuery
            .OrderByDescending(r => r.CreatedAtUtc)
            .ToListAsync();
        var summaries = await _db.Reports
            .GroupBy(r => r.Status)
            .Select(g => new AdminReportsViewModel.StatusSummary(g.Key, g.Count()))
            .ToListAsync();

        var vm = new AdminReportsViewModel
        {
            Reports = reports,
            StatusFilter = statusFilter,
            Search = search,
            StatusSummaries = summaries,
        };

        return View(vm);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateReportStatus(Guid id, ReportStatus status, string? statusFilter = null, string? search = null)
    {
        var report = await _db.Reports.FindAsync(id);
        if (report is null)
        {
            TempData["AdminReportsError"] = "Admin_Reports_Update_NotFound";
            return RedirectToAction(nameof(Reports), new { status = statusFilter, search });
        }

        if (report.Status != status)
        {
            report.Status = status;
            await _db.SaveChangesAsync();
        }

        TempData["AdminReportsSuccess"] = "Admin_Reports_Update_Success";
        return RedirectToAction(nameof(Reports), new { status = statusFilter, search });
    }
}
