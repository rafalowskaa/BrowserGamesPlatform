using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Bgp.Web.Helpers;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bgp.Web.Controllers;

[Authorize(Roles = "Admin")]
public class AdminUiController : Controller
{
    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly ILogger<AdminUiController> _logger;

    public AdminUiController(AppDbContext db, UserManager<ApplicationUser> users, ILogger<AdminUiController> logger)
    {
        _db = db;
        _users = users;
        _logger = logger;
    }

    public async Task<IActionResult> Users(string? search = null)
    {
        var query = _db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(u =>
                EF.Functions.Like(u.DisplayName ?? string.Empty, term) ||
                EF.Functions.Like(u.Email ?? string.Empty, term) ||
                EF.Functions.Like(u.UserName ?? string.Empty, term));
        }

        var adminRoleId = await _db.Roles.AsNoTracking()
            .Where(r => r.Name == "Admin")
            .Select(r => r.Id)
            .FirstOrDefaultAsync();

        var adminIds = adminRoleId is null
            ? new HashSet<string>()
            : (await _db.UserRoles.AsNoTracking()
                .Where(ur => ur.RoleId == adminRoleId)
                .Select(ur => ur.UserId)
                .ToListAsync()).ToHashSet();

        var userRows = await query
            .OrderByDescending(u => u.CreatedAtUtc)
            .Select(u => new
            {
                u.Id,
                u.DisplayName,
                u.Email,
                u.UserName,
                u.CreatedAtUtc,
                u.IsBlocked
            })
            .ToListAsync();

        var users = userRows
            .Select(u => new AdminUserRowViewModel(
                u.Id,
                DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id),
                u.Email ?? string.Empty,
                u.CreatedAtUtc,
                u.IsBlocked,
                adminIds.Contains(u.Id)))
            .ToList();

        var vm = new AdminUsersViewModel
        {
            Users = users,
            Search = search,
            SuccessKey = TempData["AdminUsersSuccess"] as string,
            ErrorKey = TempData["AdminUsersError"] as string
        };

        return View(vm);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateUser(AdminUpdateUserInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminUsersError"] = "Admin_Users_Validation";
            return RedirectToAction(nameof(Users), new { search = input.Id });
        }

        var user = await _users.FindByIdAsync(input.Id);
        if (user is null)
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToAction(nameof(Users));
        }

        var emailChanged = !string.Equals(user.Email, input.Email.Trim(), StringComparison.OrdinalIgnoreCase);
        if (emailChanged)
        {
            var setEmail = await _users.SetEmailAsync(user, input.Email.Trim());
            if (!setEmail.Succeeded)
            {
                TempData["AdminUsersError"] = setEmail.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Update_Error";
                return RedirectToAction(nameof(Users));
            }
            user.EmailConfirmed = true;
        }

        user.DisplayName = DisplayNameFormatter.Format(input.DisplayName.Trim());

        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Update_Error";
            return RedirectToAction(nameof(Users));
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_Update_Success";
        return RedirectToAction(nameof(Users), new { search = input.Id });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> BlockUser(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToAction(nameof(Users));
        }

        var user = await _users.FindByIdAsync(id);
        if (user is null)
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToAction(nameof(Users));
        }

        if (await _users.IsInRoleAsync(user, "Admin"))
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotBlockAdmin";
            return RedirectToAction(nameof(Users));
        }

        if (user.Id == _users.GetUserId(User))
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotBlockSelf";
            return RedirectToAction(nameof(Users));
        }

        user.IsBlocked = true;
        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Update_Error";
            return RedirectToAction(nameof(Users));
        }

        await _users.UpdateSecurityStampAsync(user);
        TempData["AdminUsersSuccess"] = "Admin_Users_Block_Success";
        return RedirectToAction(nameof(Users));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UnblockUser(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToAction(nameof(Users));
        }

        var user = await _users.FindByIdAsync(id);
        if (user is null)
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToAction(nameof(Users));
        }

        user.IsBlocked = false;
        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Update_Error";
            return RedirectToAction(nameof(Users));
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_Unblock_Success";
        return RedirectToAction(nameof(Users));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteUser(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToAction(nameof(Users));
        }

        var user = await _users.FindByIdAsync(id);
        if (user is null)
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToAction(nameof(Users));
        }

        if (await _users.IsInRoleAsync(user, "Admin"))
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotDeleteAdmin";
            return RedirectToAction(nameof(Users));
        }

        var result = await _users.DeleteAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Delete_Error";
            return RedirectToAction(nameof(Users));
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_Delete_Success";
        return RedirectToAction(nameof(Users));
    }

    public async Task<IActionResult> Games(string? status = null)
    {
        GameApprovalStatus? filter = null;
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<GameApprovalStatus>(status, true, out var parsed))
        {
            filter = parsed;
        }

        var gamesQuery = _db.Games.AsNoTracking();
        if (filter.HasValue)
        {
            gamesQuery = gamesQuery.Where(g => g.ApprovalStatus == filter.Value);
        }

        var gamesList = await gamesQuery
            .OrderBy(g => g.ApprovalStatus)
            .ThenByDescending(g => g.CreatedAtUtc)
            .Select(g => new
            {
                g.Id,
                g.Title,
                g.Slug,
                g.CreatedAtUtc,
                g.ApprovalStatus,
                g.ModerationNotes,
                g.CreatedByUserId
            })
            .ToListAsync();

        var ownerIds = gamesList.Select(g => g.CreatedByUserId).Distinct().ToList();
        var owners = await _db.Users.AsNoTracking()
            .Where(u => ownerIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
            .ToListAsync();
        var ownerMap = owners.ToDictionary(o => o.Id, o => DisplayNameFormatter.Format(o.DisplayName, o.Email, o.UserName, o.Id));

        var vm = new AdminGamesViewModel
        {
            Games = gamesList.Select(g => new AdminGameRowViewModel(
                g.Id,
                g.Title,
                g.Slug,
                ownerMap.GetValueOrDefault(g.CreatedByUserId, g.CreatedByUserId.ToUpperInvariant()),
                g.CreatedAtUtc,
                g.ApprovalStatus,
                g.ModerationNotes)).ToList(),
            Filter = filter,
            SuccessKey = TempData["AdminGamesSuccess"] as string,
            ErrorKey = TempData["AdminGamesError"] as string
        };

        return View(vm);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ApproveGame(Guid id)
    {
        var game = await _db.Games.FindAsync(id);
        if (game is null)
        {
            TempData["AdminGamesError"] = "Admin_Games_NotFound";
            return RedirectToAction(nameof(Games));
        }

        game.ApprovalStatus = GameApprovalStatus.Approved;
        game.ApprovedAtUtc = DateTime.UtcNow;
        game.ModerationNotes = null;
        await _db.SaveChangesAsync();

        TempData["AdminGamesSuccess"] = "Admin_Games_Approve_Success";
        return RedirectToAction(nameof(Games));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> RejectGame(AdminRejectGameInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminGamesError"] = "Admin_Games_Validation";
            return RedirectToAction(nameof(Games));
        }

        var game = await _db.Games.FindAsync(input.Id);
        if (game is null)
        {
            TempData["AdminGamesError"] = "Admin_Games_NotFound";
            return RedirectToAction(nameof(Games));
        }

        game.ApprovalStatus = GameApprovalStatus.Rejected;
        game.ModerationNotes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim();
        game.ApprovedAtUtc = null;
        await _db.SaveChangesAsync();

        TempData["AdminGamesSuccess"] = "Admin_Games_Reject_Success";
        return RedirectToAction(nameof(Games));
    }

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
