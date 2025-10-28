using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Bgp.Web.Helpers;
using Bgp.Domain.Entities;
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

[Authorize(Roles = "Admin,Moderator")]
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

        var managedRoles = await _db.Roles.AsNoTracking()
            .Where(r => r.Name == "Admin" || r.Name == "Moderator")
            .Select(r => new { r.Id, r.Name })
            .ToListAsync();

        var adminRoleId = managedRoles.FirstOrDefault(r => r.Name == "Admin")?.Id;
        var moderatorRoleId = managedRoles.FirstOrDefault(r => r.Name == "Moderator")?.Id;

        var adminIds = adminRoleId is null
            ? new HashSet<string>()
            : (await _db.UserRoles.AsNoTracking()
                .Where(ur => ur.RoleId == adminRoleId)
                .Select(ur => ur.UserId)
                .ToListAsync()).ToHashSet();

        var moderatorIds = moderatorRoleId is null
            ? new HashSet<string>()
            : (await _db.UserRoles.AsNoTracking()
                .Where(ur => ur.RoleId == moderatorRoleId)
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
                u.IsBlocked,
                u.BlockedUntilUtc,
                u.BlockReason
            })
            .ToListAsync();

        var nowUtc = DateTime.UtcNow;
        var expiredBlocks = userRows
            .Where(u => u.IsBlocked && u.BlockedUntilUtc.HasValue && u.BlockedUntilUtc.Value <= nowUtc)
            .Select(u => u.Id)
            .ToList();

        if (expiredBlocks.Count > 0)
        {
            var expiredBlockSet = expiredBlocks.ToHashSet();
            var expiredUsers = await _db.Users
                .Where(u => expiredBlockSet.Contains(u.Id))
                .ToListAsync();

            foreach (var expired in expiredUsers)
            {
                expired.IsBlocked = false;
                expired.BlockedUntilUtc = null;
                expired.BlockReason = null;
            }

            await _db.SaveChangesAsync();

            userRows = userRows
                .Select(u => expiredBlockSet.Contains(u.Id)
                    ? new
                    {
                        u.Id,
                        u.DisplayName,
                        u.Email,
                        u.UserName,
                        u.CreatedAtUtc,
                        IsBlocked = false,
                        BlockedUntilUtc = (DateTime?)null,
                        BlockReason = (string?)null
                    }
                    : u)
                .ToList();
        }

        var pendingDisplayNames = await _db.Users
            .AsNoTracking()
            .Where(u => u.PendingDisplayName != null)
            .OrderByDescending(u => u.PendingDisplayNameRequestedAtUtc)
            .Select(u => new DisplayNameRequestViewModel(
                u.Id,
                DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id),
                u.PendingDisplayName!,
                u.PendingDisplayNameRequestedAtUtc))
            .ToListAsync();

        var users = userRows
            .Select(u =>
            {
                var isBlocked = u.IsBlocked;
                var blockedUntil = u.BlockedUntilUtc;
                if (!isBlocked)
                {
                    blockedUntil = null;
                }

                var accessLevel = adminIds.Contains(u.Id)
                    ? AdminUserAccessLevel.Admin
                    : moderatorIds.Contains(u.Id)
                        ? AdminUserAccessLevel.Moderator
                        : AdminUserAccessLevel.User;

                return new AdminUserRowViewModel(
                    u.Id,
                    DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id),
                    u.Email ?? string.Empty,
                    u.CreatedAtUtc,
                    isBlocked,
                    blockedUntil,
                    u.BlockReason,
                    accessLevel);
            })
            .ToList();

        var vm = new AdminUsersViewModel
        {
            Users = users,
            Search = search,
            SuccessKey = TempData["AdminUsersSuccess"] as string,
            ErrorKey = TempData["AdminUsersError"] as string,
            DisplayNameRequests = pendingDisplayNames
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

        var currentUserId = _users.GetUserId(User);
        var isCurrentAdmin = User.IsInRole("Admin");
        var isCurrentModerator = User.IsInRole("Moderator");
        var targetIsAdmin = await _users.IsInRoleAsync(user, "Admin");
        var targetIsModerator = await _users.IsInRoleAsync(user, "Moderator");

        var desiredAccess = input.AccessLevel;

        if (!isCurrentAdmin)
        {
            if (!isCurrentModerator)
            {
                return Forbid();
            }

            if (targetIsAdmin)
            {
                TempData["AdminUsersError"] = "Admin_Users_CannotModifyAdmin";
                return RedirectToAction(nameof(Users));
            }

            var isEditingSelf = string.Equals(user.Id, currentUserId, StringComparison.Ordinal);

            if (targetIsModerator && !isEditingSelf)
            {
                TempData["AdminUsersError"] = "Admin_Users_CannotModifyModerator";
                return RedirectToAction(nameof(Users));
            }

            if (targetIsModerator)
            {
                if (desiredAccess != AdminUserAccessLevel.Moderator)
                {
                    TempData["AdminUsersError"] = "Admin_Users_CannotChangeRole";
                    return RedirectToAction(nameof(Users));
                }
            }
            else if (desiredAccess != AdminUserAccessLevel.User)
            {
                TempData["AdminUsersError"] = "Admin_Users_CannotChangeRole";
                return RedirectToAction(nameof(Users));
            }
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

        if (!await _users.IsInRoleAsync(user, "User"))
        {
            var addUserRole = await _users.AddToRoleAsync(user, "User");
            if (!addUserRole.Succeeded)
            {
                TempData["AdminUsersError"] = addUserRole.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Role_Update_Error";
                return RedirectToAction(nameof(Users));
            }
        }

        if (isCurrentAdmin || string.Equals(user.Id, currentUserId, StringComparison.Ordinal))
        {
            async Task<bool> RemoveRoleAsync(string role)
            {
                if (!await _users.IsInRoleAsync(user, role))
                {
                    return true;
                }

                var remove = await _users.RemoveFromRoleAsync(user, role);
                if (!remove.Succeeded)
                {
                    TempData["AdminUsersError"] = remove.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Role_Update_Error";
                    return false;
                }

                return true;
            }

            async Task<bool> AddRoleAsync(string role)
            {
                if (await _users.IsInRoleAsync(user, role))
                {
                    return true;
                }

                var add = await _users.AddToRoleAsync(user, role);
                if (!add.Succeeded)
                {
                    TempData["AdminUsersError"] = add.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Role_Update_Error";
                    return false;
                }

                return true;
            }

            switch (desiredAccess)
            {
                case AdminUserAccessLevel.Admin:
                    if (!await AddRoleAsync("Admin"))
                    {
                        return RedirectToAction(nameof(Users));
                    }

                    if (!await RemoveRoleAsync("Moderator"))
                    {
                        return RedirectToAction(nameof(Users));
                    }

                    break;

                case AdminUserAccessLevel.Moderator:
                    if (!await RemoveRoleAsync("Admin"))
                    {
                        return RedirectToAction(nameof(Users));
                    }

                    if (!await AddRoleAsync("Moderator"))
                    {
                        return RedirectToAction(nameof(Users));
                    }

                    break;

                default:
                    if (!await RemoveRoleAsync("Admin"))
                    {
                        return RedirectToAction(nameof(Users));
                    }

                    if (!await RemoveRoleAsync("Moderator"))
                    {
                        return RedirectToAction(nameof(Users));
                    }

                    break;
            }
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_Update_Success";
        return RedirectToAction(nameof(Users), new { search = input.Id });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> BlockUser(AdminBlockUserInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminUsersError"] = "Admin_Users_Validation";
            return RedirectToAction(nameof(Users));
        }

        if (string.IsNullOrWhiteSpace(input.Id))
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToAction(nameof(Users));
        }

        var user = await _users.FindByIdAsync(input.Id);
        if (user is null)
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToAction(nameof(Users));
        }

        var currentUserId = _users.GetUserId(User);
        var isCurrentAdmin = User.IsInRole("Admin");
        var isCurrentModerator = User.IsInRole("Moderator");
        var targetIsAdmin = await _users.IsInRoleAsync(user, "Admin");
        var targetIsModerator = await _users.IsInRoleAsync(user, "Moderator");

        if (targetIsAdmin)
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotBlockAdmin";
            return RedirectToAction(nameof(Users));
        }

        if (!isCurrentAdmin)
        {
            if (!isCurrentModerator)
            {
                return Forbid();
            }

            if (targetIsModerator && !string.Equals(user.Id, currentUserId, StringComparison.Ordinal))
            {
                TempData["AdminUsersError"] = "Admin_Users_CannotBlockModerator";
                return RedirectToAction(nameof(Users));
            }
        }

        if (user.Id == currentUserId)
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotBlockSelf";
            return RedirectToAction(nameof(Users));
        }

        DateTime? blockedUntilUtc = null;
        if (input.BlockedUntil.HasValue)
        {
            var local = DateTime.SpecifyKind(input.BlockedUntil.Value, DateTimeKind.Local);
            blockedUntilUtc = local.ToUniversalTime();

            if (blockedUntilUtc <= DateTime.UtcNow)
            {
                TempData["AdminUsersError"] = "Admin_Users_Block_InvalidUntil";
                return RedirectToAction(nameof(Users));
            }
        }

        var reason = input.Reason?.Trim();
        if (string.IsNullOrWhiteSpace(reason))
        {
            TempData["AdminUsersError"] = "Admin_Users_Validation";
            return RedirectToAction(nameof(Users));
        }

        user.IsBlocked = true;
        user.BlockedUntilUtc = blockedUntilUtc;
        user.BlockReason = reason;
        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Update_Error";
            return RedirectToAction(nameof(Users));
        }

        await _users.UpdateSecurityStampAsync(user);
        TempData["AdminUsersSuccess"] = blockedUntilUtc.HasValue ? "Admin_Users_Block_Success_Until" : "Admin_Users_Block_Success";
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

        var currentUserId = _users.GetUserId(User);
        var isCurrentAdmin = User.IsInRole("Admin");
        var isCurrentModerator = User.IsInRole("Moderator");
        var targetIsAdmin = await _users.IsInRoleAsync(user, "Admin");
        var targetIsModerator = await _users.IsInRoleAsync(user, "Moderator");

        if (targetIsAdmin && !isCurrentAdmin)
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotModifyAdmin";
            return RedirectToAction(nameof(Users));
        }

        if (!isCurrentAdmin)
        {
            if (!isCurrentModerator)
            {
                return Forbid();
            }

            if (targetIsModerator && !string.Equals(user.Id, currentUserId, StringComparison.Ordinal))
            {
                TempData["AdminUsersError"] = "Admin_Users_CannotModifyModerator";
                return RedirectToAction(nameof(Users));
            }
        }

        user.IsBlocked = false;
        user.BlockedUntilUtc = null;
        user.BlockReason = null;
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

        var currentUserId = _users.GetUserId(User);
        var isCurrentAdmin = User.IsInRole("Admin");
        var isCurrentModerator = User.IsInRole("Moderator");
        var targetIsAdmin = await _users.IsInRoleAsync(user, "Admin");
        var targetIsModerator = await _users.IsInRoleAsync(user, "Moderator");

        if (targetIsAdmin && !isCurrentAdmin)
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotDeleteAdmin";
            return RedirectToAction(nameof(Users));
        }

        if (!isCurrentAdmin)
        {
            if (!isCurrentModerator)
            {
                return Forbid();
            }

            if (targetIsModerator && !string.Equals(user.Id, currentUserId, StringComparison.Ordinal))
            {
                TempData["AdminUsersError"] = "Admin_Users_CannotDeleteModerator";
                return RedirectToAction(nameof(Users));
            }
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

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ApproveDisplayName(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            TempData["AdminUsersError"] = "Admin_Users_DisplayName_NotFound";
            return RedirectToAction(nameof(Users));
        }

        var user = await _users.FindByIdAsync(id);
        if (user is null || string.IsNullOrWhiteSpace(user.PendingDisplayName))
        {
            TempData["AdminUsersError"] = "Admin_Users_DisplayName_NotFound";
            return RedirectToAction(nameof(Users));
        }

        user.DisplayName = user.PendingDisplayName;
        user.PendingDisplayName = null;
        user.PendingDisplayNameRequestedAtUtc = null;
        user.DisplayNameLastApprovedAtUtc = DateTime.UtcNow;

        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_DisplayName_UpdateError";
            return RedirectToAction(nameof(Users));
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_DisplayNameApproved";
        return RedirectToAction(nameof(Users));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> RejectDisplayName(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            TempData["AdminUsersError"] = "Admin_Users_DisplayName_NotFound";
            return RedirectToAction(nameof(Users));
        }

        var user = await _users.FindByIdAsync(id);
        if (user is null || string.IsNullOrWhiteSpace(user.PendingDisplayName))
        {
            TempData["AdminUsersError"] = "Admin_Users_DisplayName_NotFound";
            return RedirectToAction(nameof(Users));
        }

        user.PendingDisplayName = null;
        user.PendingDisplayNameRequestedAtUtc = null;

        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_DisplayName_UpdateError";
            return RedirectToAction(nameof(Users));
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_DisplayNameRejected";
        return RedirectToAction(nameof(Users));
    }

    public async Task<IActionResult> Games(string? status = null)
    {
        GameApprovalStatus? filter = null;
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<GameApprovalStatus>(status, true, out var parsed))
        {
            filter = parsed;
        }

        IQueryable<Game> gamesQuery = _db.Games
            .AsNoTracking()
            .Include(g => g.Tags);
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
                g.CreatedByUserId,
                g.ProposedCategories,
                g.Categories,
                g.ProposedModes,
                g.Modes,
                Tags = g.Tags.Select(t => new { t.Id, t.Value, t.IsApproved, t.ReviewedAtUtc }).ToList()
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
                g.ModerationNotes,
                g.ProposedCategories,
                g.Categories,
                g.ProposedModes,
                g.Modes,
                g.Tags.Select(t => new AdminGameTagViewModel(t.Id, t.Value, t.IsApproved, t.ReviewedAtUtc is null)).ToList())).ToList(),
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
    public async Task<IActionResult> UpdateGameMetadata(AdminUpdateGameMetadataInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminGamesError"] = "Admin_Games_Metadata_Validation";
            return RedirectToAction(nameof(Games));
        }

        var game = await _db.Games.Include(g => g.Tags).FirstOrDefaultAsync(g => g.Id == input.Id);
        if (game is null)
        {
            TempData["AdminGamesError"] = "Admin_Games_NotFound";
            return RedirectToAction(nameof(Games));
        }

        GameCategory categories = GameCategory.None;
        if (input.Categories is not null)
        {
            foreach (var value in input.Categories)
            {
                if (Enum.IsDefined(typeof(GameCategory), value))
                {
                    categories |= (GameCategory)value;
                }
            }
        }

        GameMode modes = GameMode.None;
        if (input.Modes is not null)
        {
            foreach (var value in input.Modes)
            {
                if (Enum.IsDefined(typeof(GameMode), value))
                {
                    modes |= (GameMode)value;
                }
            }
        }

        if (modes == GameMode.None)
        {
            modes = GameMode.Singleplayer;
        }

        var approvedTags = input.ApprovedTags?.ToHashSet() ?? new HashSet<Guid>();
        foreach (var tag in game.Tags)
        {
            tag.IsApproved = approvedTags.Contains(tag.Id);
            tag.ReviewedAtUtc = DateTime.UtcNow;
        }

        game.Categories = categories == GameCategory.None ? GameCategory.Indie : categories;
        game.Modes = modes;
        game.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        TempData["AdminGamesSuccess"] = "Admin_Games_Metadata_Success";
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
