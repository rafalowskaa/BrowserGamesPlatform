using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Bgp.Web.Helpers;
using Bgp.Domain.Entities;
using System.IO;
using Bgp.Application.Interfaces;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Models;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bgp.Web.Controllers;

[Authorize(Roles = "Admin,Moderator")]
public class AdminUiController : Controller
{
    private static readonly Regex SlugRegex = new("[^a-z0-9-]", RegexOptions.Compiled);

    private readonly AppDbContext _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly ILogger<AdminUiController> _logger;
    private readonly IGameContentResolver _contentResolver;
    private readonly IFileStorage _fileStorage;

    public AdminUiController(AppDbContext db, UserManager<ApplicationUser> users, ILogger<AdminUiController> logger, IGameContentResolver contentResolver, IFileStorage fileStorage)
    {
        _db = db;
        _users = users;
        _logger = logger;
        _contentResolver = contentResolver;
        _fileStorage = fileStorage;
    }

    private IActionResult RedirectToUsers(string? search, string? fallbackSearch = null)
    {
        if (!string.IsNullOrWhiteSpace(search))
        {
            return RedirectToAction(nameof(Users), new { search });
        }

        if (!string.IsNullOrWhiteSpace(fallbackSearch))
        {
            return RedirectToAction(nameof(Users), new { search = fallbackSearch });
        }

        return RedirectToAction(nameof(Users));
    }

    private IActionResult RedirectToContentSection(string? section = null)
    {
        var target = Url.Action(nameof(Content)) ?? "/AdminUi/Content";
        if (string.IsNullOrWhiteSpace(section))
        {
            return Redirect(target);
        }

        return Redirect($"{target}#{section}");
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
                    u.UserName,
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
    public async Task<IActionResult> UpdateUser(AdminUpdateUserInputModel input, string? search)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminUsersError"] = "Admin_Users_Validation";
            return RedirectToUsers(search, input.Id);
        }

        var user = await _users.FindByIdAsync(input.Id);
        if (user is null)
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToUsers(search);
        }

        var currentUserId = _users.GetUserId(User);
        var isCurrentAdmin = User.IsInRole("Admin");
        var isCurrentModerator = User.IsInRole("Moderator");
        var targetIsAdmin = await _users.IsInRoleAsync(user, "Admin");
        var targetIsModerator = await _users.IsInRoleAsync(user, "Moderator");

        var desiredAccess = input.AccessLevel;
        var isEditingSelf = string.Equals(user.Id, currentUserId, StringComparison.Ordinal);

        if (targetIsAdmin)
        {
            if (!isEditingSelf)
            {
                TempData["AdminUsersError"] = "Admin_Users_CannotModifyAdmin";
                return RedirectToUsers(search);
            }

            desiredAccess = AdminUserAccessLevel.Admin;
        }
        else if (desiredAccess == AdminUserAccessLevel.Admin)
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotChangeRole";
            return RedirectToUsers(search);
        }

        if (!isCurrentAdmin)
        {
            if (!isCurrentModerator)
            {
                return Forbid();
            }

            if (targetIsModerator && !isEditingSelf)
            {
                TempData["AdminUsersError"] = "Admin_Users_CannotModifyModerator";
                return RedirectToUsers(search);
            }

            if (targetIsModerator)
            {
                if (desiredAccess != AdminUserAccessLevel.Moderator)
                {
                    TempData["AdminUsersError"] = "Admin_Users_CannotChangeRole";
                    return RedirectToUsers(search);
                }
            }
            else if (desiredAccess != AdminUserAccessLevel.User && desiredAccess != AdminUserAccessLevel.Moderator)
            {
                TempData["AdminUsersError"] = "Admin_Users_CannotChangeRole";
                return RedirectToUsers(search);
            }
        }

        var emailChanged = !string.Equals(user.Email, input.Email.Trim(), StringComparison.OrdinalIgnoreCase);
        if (emailChanged)
        {
            var setEmail = await _users.SetEmailAsync(user, input.Email.Trim());
            if (!setEmail.Succeeded)
            {
                TempData["AdminUsersError"] = setEmail.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Update_Error";
                return RedirectToUsers(search);
            }
            user.EmailConfirmed = true;
        }

        user.DisplayName = DisplayNameFormatter.Format(input.DisplayName.Trim());

        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Update_Error";
            return RedirectToUsers(search);
        }

        if (!await _users.IsInRoleAsync(user, "User"))
        {
            var addUserRole = await _users.AddToRoleAsync(user, "User");
            if (!addUserRole.Succeeded)
            {
                TempData["AdminUsersError"] = addUserRole.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Role_Update_Error";
                return RedirectToUsers(search);
            }
        }

        if (isCurrentAdmin || isCurrentModerator)
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
                        return RedirectToUsers(search);
                    }

                    if (!await RemoveRoleAsync("Moderator"))
                    {
                        return RedirectToUsers(search);
                    }

                    break;

                case AdminUserAccessLevel.Moderator:
                    if (!await RemoveRoleAsync("Admin"))
                    {
                        return RedirectToUsers(search);
                    }

                    if (!await AddRoleAsync("Moderator"))
                    {
                        return RedirectToUsers(search);
                    }

                    break;

                default:
                    if (!await RemoveRoleAsync("Admin"))
                    {
                        return RedirectToUsers(search);
                    }

                    if (!await RemoveRoleAsync("Moderator"))
                    {
                        return RedirectToUsers(search);
                    }

                    break;
            }
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_Update_Success";
        return RedirectToUsers(search);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> BlockUser(AdminBlockUserInputModel input, string? search)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminUsersError"] = "Admin_Users_Validation";
            return RedirectToUsers(search);
        }

        if (string.IsNullOrWhiteSpace(input.Id))
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToUsers(search);
        }

        var user = await _users.FindByIdAsync(input.Id);
        if (user is null)
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToUsers(search);
        }

        var currentUserId = _users.GetUserId(User);
        var isCurrentAdmin = User.IsInRole("Admin");
        var isCurrentModerator = User.IsInRole("Moderator");
        var targetIsAdmin = await _users.IsInRoleAsync(user, "Admin");
        var targetIsModerator = await _users.IsInRoleAsync(user, "Moderator");

        if (targetIsAdmin)
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotBlockAdmin";
            return RedirectToUsers(search);
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
            return RedirectToUsers(search);
        }

        DateTime? blockedUntilUtc = null;
        if (input.BlockedUntil.HasValue)
        {
            var local = DateTime.SpecifyKind(input.BlockedUntil.Value, DateTimeKind.Local);
            blockedUntilUtc = local.ToUniversalTime();

            if (blockedUntilUtc <= DateTime.UtcNow)
            {
                TempData["AdminUsersError"] = "Admin_Users_Block_InvalidUntil";
                return RedirectToUsers(search);
            }
        }

        var reason = input.Reason?.Trim();
        if (string.IsNullOrWhiteSpace(reason))
        {
            TempData["AdminUsersError"] = "Admin_Users_Validation";
            return RedirectToUsers(search);
        }

        user.IsBlocked = true;
        user.BlockedUntilUtc = blockedUntilUtc;
        user.BlockReason = reason;
        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Update_Error";
            return RedirectToUsers(search);
        }

        await _users.UpdateSecurityStampAsync(user);
        TempData["AdminUsersSuccess"] = blockedUntilUtc.HasValue ? "Admin_Users_Block_Success_Until" : "Admin_Users_Block_Success";
        return RedirectToUsers(search);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UnblockUser(string id, string? search)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToUsers(search);
        }

        var user = await _users.FindByIdAsync(id);
        if (user is null)
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToUsers(search);
        }

        var currentUserId = _users.GetUserId(User);
        var isCurrentAdmin = User.IsInRole("Admin");
        var isCurrentModerator = User.IsInRole("Moderator");
        var targetIsAdmin = await _users.IsInRoleAsync(user, "Admin");
        var targetIsModerator = await _users.IsInRoleAsync(user, "Moderator");

        if (targetIsAdmin && !isCurrentAdmin)
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotModifyAdmin";
            return RedirectToUsers(search);
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
                return RedirectToUsers(search);
            }
        }

        user.IsBlocked = false;
        user.BlockedUntilUtc = null;
        user.BlockReason = null;
        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Update_Error";
            return RedirectToUsers(search);
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_Unblock_Success";
        return RedirectToUsers(search);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> GrantExperience(AdminGrantExperienceInputModel input, string? search)
    {
        var normalizedAmount = Math.Max(0, input.Amount);

        if (!ModelState.IsValid ||
            (input.Operation != GrantExperienceOperation.Set && normalizedAmount <= 0))
        {
            TempData["AdminUsersError"] = "Admin_Users_Xp_Error";
            return RedirectToUsers(search);
        }

        var user = await _users.FindByIdAsync(input.Id);
        if (user is null)
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToUsers(search);
        }

        var original = user.BonusExperience;
        switch (input.Operation)
        {
            case GrantExperienceOperation.Add:
                user.BonusExperience += normalizedAmount;
                break;
            case GrantExperienceOperation.Remove:
                user.BonusExperience = Math.Max(0, user.BonusExperience - normalizedAmount);
                break;
            case GrantExperienceOperation.Set:
                user.BonusExperience = normalizedAmount;
                break;
            default:
                TempData["AdminUsersError"] = "Admin_Users_Xp_Error";
                return RedirectToUsers(search);
        }
        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Update_Error";
            return RedirectToUsers(search);
        }

        _logger.LogInformation("Updated XP for user {UserId} via {Operation} (delta: {Amount}, original: {Original}, new: {NewValue}). Reason: {Reason}",
             user.Id,
             input.Operation,
             normalizedAmount,
             original,
             user.BonusExperience,
             input.Reason);
        TempData["AdminUsersSuccess"] = "Admin_Users_Xp_Success";
        return RedirectToUsers(search);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteUser(string id, string? search)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToUsers(search);
        }

        var user = await _users.FindByIdAsync(id);
        if (user is null)
        {
            TempData["AdminUsersError"] = "Admin_Users_NotFound";
            return RedirectToUsers(search);
        }

        var currentUserId = _users.GetUserId(User);
        var isCurrentAdmin = User.IsInRole("Admin");
        var isCurrentModerator = User.IsInRole("Moderator");
        var targetIsAdmin = await _users.IsInRoleAsync(user, "Admin");
        var targetIsModerator = await _users.IsInRoleAsync(user, "Moderator");

        if (string.Equals(user.Id, currentUserId, StringComparison.Ordinal))
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotDeleteSelf";
            return RedirectToUsers(search);
        }

        if (targetIsAdmin)
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotDeleteAdmin";
            return RedirectToUsers(search);
        }

        if (!isCurrentAdmin && !isCurrentModerator)
        {
            return Forbid();
        }

        if (!isCurrentAdmin && targetIsModerator && !string.Equals(user.Id, currentUserId, StringComparison.Ordinal))
        {
            TempData["AdminUsersError"] = "Admin_Users_CannotDeleteModerator";
            return RedirectToUsers(search);
        }

        var result = await _users.DeleteAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_Delete_Error";
            return RedirectToUsers(search);
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_Delete_Success";
        return RedirectToUsers(search);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ApproveDisplayName(string id, string? search)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            TempData["AdminUsersError"] = "Admin_Users_DisplayName_NotFound";
            return RedirectToUsers(search);
        }

        var user = await _users.FindByIdAsync(id);
        if (user is null || string.IsNullOrWhiteSpace(user.PendingDisplayName))
        {
            TempData["AdminUsersError"] = "Admin_Users_DisplayName_NotFound";
            return RedirectToUsers(search);
        }

        user.DisplayName = user.PendingDisplayName;
        user.PendingDisplayName = null;
        user.PendingDisplayNameRequestedAtUtc = null;
        user.DisplayNameLastApprovedAtUtc = DateTime.UtcNow;

        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_DisplayName_UpdateError";
            return RedirectToUsers(search);
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_DisplayNameApproved";
        return RedirectToUsers(search);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> RejectDisplayName(string id, string? search)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            TempData["AdminUsersError"] = "Admin_Users_DisplayName_NotFound";
            return RedirectToUsers(search);
        }

        var user = await _users.FindByIdAsync(id);
        if (user is null || string.IsNullOrWhiteSpace(user.PendingDisplayName))
        {
            TempData["AdminUsersError"] = "Admin_Users_DisplayName_NotFound";
            return RedirectToUsers(search);
        }

        user.PendingDisplayName = null;
        user.PendingDisplayNameRequestedAtUtc = null;

        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            TempData["AdminUsersError"] = result.Errors.FirstOrDefault()?.Description ?? "Admin_Users_DisplayName_UpdateError";
            return RedirectToUsers(search);
        }

        TempData["AdminUsersSuccess"] = "Admin_Users_DisplayNameRejected";
        return RedirectToUsers(search);
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
                g.Rules,
                g.Description,
                g.CoverImagePath,
                g.RejectedAtUtc,
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
                g.RejectedAtUtc,
                g.ApprovalStatus,
                g.ModerationNotes,
                g.ProposedCategories,
                g.Categories,
                g.ProposedModes,
                g.Modes,
                g.Description,
                g.Rules,
                g.CoverImagePath,
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
        game.RejectedAtUtc = null;
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

        var title = input.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            TempData["AdminGamesError"] = "Admin_Games_Metadata_Title_Required";
            return RedirectToAction(nameof(Games));
        }

        var normalizedSlug = NormalizeSlug(input.Slug);
        if (string.IsNullOrWhiteSpace(normalizedSlug))
        {
            TempData["AdminGamesError"] = "Admin_Games_Metadata_Slug_Invalid";
            return RedirectToAction(nameof(Games));
        }

        var slugExists = await _db.Games
            .AsNoTracking()
            .AnyAsync(g => g.Slug == normalizedSlug && g.Id != game.Id);
        if (slugExists)
        {
            TempData["AdminGamesError"] = "Admin_Games_Metadata_Slug_Exists";
            return RedirectToAction(nameof(Games));
        }

        string? uploadedCoverPath = null;
        if (input.CoverImageUpload is { Length: > 0 })
        {
            const long maxCoverSize = 5 * 1024 * 1024;
            if (input.CoverImageUpload.Length > maxCoverSize ||
                string.IsNullOrWhiteSpace(input.CoverImageUpload.ContentType) ||
                !input.CoverImageUpload.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            {
                TempData["AdminGamesError"] = "Admin_Games_Metadata_Cover_Upload_Error";
                return RedirectToAction(nameof(Games));
            }

            var extension = Path.GetExtension(input.CoverImageUpload.FileName);
            if (string.IsNullOrWhiteSpace(extension) || extension.Length > 8)
            {
                extension = ".png";
            }

            var coverFileName = $"{normalizedSlug}{extension}";
            try
            {
                await using var stream = input.CoverImageUpload.OpenReadStream();
                uploadedCoverPath = await _fileStorage.SaveAsync(stream, coverFileName, Path.Combine("uploads", "covers"));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upload cover image for game {GameId}", game.Id);
                TempData["AdminGamesError"] = "Admin_Games_Metadata_Cover_Upload_Error";
                return RedirectToAction(nameof(Games));
            }
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

        game.Title = title;
        game.Slug = normalizedSlug;
        game.Description = string.IsNullOrWhiteSpace(input.Description) ? null : input.Description.Trim();
        game.Rules = string.IsNullOrWhiteSpace(input.Rules) ? null : input.Rules.Trim();
        var manualCoverPath = string.IsNullOrWhiteSpace(input.CoverImagePath) ? null : input.CoverImagePath.Trim();
        game.CoverImagePath = uploadedCoverPath ?? manualCoverPath;
        game.Categories = categories == GameCategory.None ? GameCategory.Indie : categories;
        game.Modes = modes;
        game.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        if (IsAjaxRequest())
        {
            return Json(new { coverImagePath = game.CoverImagePath });
        }

        TempData["AdminGamesSuccess"] = "Admin_Games_Metadata_Success";
        return RedirectToAction(nameof(Games));
    }

    public async Task<IActionResult> PlayGame(Guid id)
    {
        var game = await _db.Games
            .Include(g => g.Versions)
            .Include(g => g.Tags)
            .FirstOrDefaultAsync(g => g.Id == id);

        if (game is null)
        {
            return NotFound();
        }

        var owner = await _db.Users.AsNoTracking()
            .Where(u => u.Id == game.CreatedByUserId)
            .Select(u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id))
            .FirstOrDefaultAsync();

        var latestVersion = game.Versions.OrderByDescending(v => v.PublishedAtUtc).FirstOrDefault();
        var playOptions = _contentResolver.Resolve(latestVersion?.ContentPath);

        var vm = new GameDetailsViewModel
        {
            Game = game,
            OwnerName = owner ?? game.CreatedByUserId.ToUpperInvariant(),
            PlayOptions = playOptions
        };

        return View(vm);
    }

    private static string NormalizeSlug(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var slug = value.Trim().ToLowerInvariant();
        slug = SlugRegex.Replace(slug, string.Empty);
        slug = Regex.Replace(slug, "-+", "-");
        slug = slug.Trim('-');
        return slug;
    }

    private bool IsAjaxRequest()
    {
        return Request?.Headers.TryGetValue("X-Requested-With", out var value) == true &&
               string.Equals(value, "XMLHttpRequest", StringComparison.OrdinalIgnoreCase);
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
        game.RejectedAtUtc = DateTime.UtcNow;
        game.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        TempData["AdminGamesSuccess"] = "Admin_Games_Reject_Success";
        return RedirectToAction(nameof(Games));
    }

    public async Task<IActionResult> Reports(string? status = null, string? search = null)
    {
        var reportsQuery = _db.Reports.AsNoTracking().AsQueryable();

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

        var reportRows = await reportsQuery
            .OrderByDescending(r => r.CreatedAtUtc)
            .Select(r => new
            {
                r.Id,
                r.CreatedAtUtc,
                r.ReporterUserId,
                r.TargetUserId,
                r.Category,
                r.Description,
                r.Status
            })
            .ToListAsync();

        var userIds = reportRows
            .SelectMany(r => new[] { r.ReporterUserId, r.TargetUserId })
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var userLookup = userIds.Count == 0
            ? new Dictionary<string, string>(StringComparer.Ordinal)
            : (await _db.Users
                .AsNoTracking()
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
                .ToListAsync())
                .ToDictionary(
                    u => u.Id,
                    u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id),
                    StringComparer.Ordinal);

        var reports = reportRows
            .Select(r => new AdminReportsViewModel.ReportRow(
                r.Id,
                r.CreatedAtUtc,
                r.ReporterUserId,
                userLookup.TryGetValue(r.ReporterUserId, out var reporterName) ? reporterName : r.ReporterUserId,
                r.TargetUserId,
                userLookup.TryGetValue(r.TargetUserId, out var targetName) ? targetName : r.TargetUserId,
                r.Category,
                r.Description,
                r.Status))
            .ToList();

        var summaries = await _db.Reports
            .AsNoTracking()
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

    public async Task<IActionResult> Content()
    {
        var facts = await _db.HomeFacts
            .AsNoTracking()
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.Id)
            .Select(f => new AdminHomeFactViewModel(
                f.Id,
                f.Content,
                f.IsActive,
                f.SortOrder,
                f.CreatedAtUtc,
                f.UpdatedAtUtc))
            .ToListAsync();

        var events = await _db.HomeEvents
            .AsNoTracking()
            .Include(e => e.Game)
            .OrderBy(e => e.SortOrder)
            .ThenBy(e => e.Id)
            .Select(e => new AdminHomeEventViewModel(
                e.Id,
                e.Title,
                e.Reward,
                e.StartsAtUtc,
                e.EndsAtUtc,
                e.IsActive,
                e.SortOrder,
                e.GameId,
                e.Game != null ? e.Game.Title : null,
                e.Game != null ? e.Game.Slug : null,
                e.ImagePath,
                e.CreatedAtUtc,
                e.UpdatedAtUtc))
            .ToListAsync();

        var featured = await _db.HomeFeaturedGames
            .AsNoTracking()
            .Include(f => f.Game)
            .OrderByDescending(f => f.IsActive)
            .ThenByDescending(f => f.StartsAtUtc)
            .Select(f => new AdminHomeFeaturedGameViewModel(
                f.Id,
                f.GameId,
                f.Game!.Title,
                f.Game.Slug,
                f.Game.CoverImagePath,
                f.CustomDescription,
                f.StartsAtUtc,
                f.EndsAtUtc,
                f.IsActive,
                f.CreatedAtUtc,
                f.UpdatedAtUtc))
            .FirstOrDefaultAsync();

        var gameOptions = await _db.Games
            .AsNoTracking()
            .Where(g => g.ApprovalStatus == GameApprovalStatus.Approved)
            .OrderBy(g => g.Title)
            .Select(g => new AdminFeaturedGameOptionViewModel(
                g.Id,
                g.Title,
                g.Slug,
                g.CoverImagePath,
                g.Description))
            .ToListAsync();

        var vm = new AdminHomeContentViewModel
        {
            Facts = facts,
            Events = events,
            FeaturedGame = featured,
            GameOptions = gameOptions,
            SuccessKey = TempData["AdminContentSuccess"] as string,
            ErrorKey = TempData["AdminContentError"] as string
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

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> SaveFact(AdminUpsertHomeFactInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminContentError"] = "Admin_Content_Error_Validation";
            return RedirectToContentSection("facts");
        }

        var content = (input.Content ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(content))
        {
            TempData["AdminContentError"] = "Admin_Content_Error_Validation";
            return RedirectToContentSection("facts");
        }

        HomeFact fact;

        if (input.Id.HasValue)
        {
            fact = await _db.HomeFacts.FindAsync(input.Id.Value);
            if (fact is null)
            {
                TempData["AdminContentError"] = "Admin_Content_Error_NotFound";
                return RedirectToContentSection("facts");
            }
        }
        else
        {
            fact = new HomeFact
            {
                CreatedAtUtc = DateTime.UtcNow
            };
            await _db.HomeFacts.AddAsync(fact);
        }

        fact.Content = content;
        fact.IsActive = input.IsActive;
        fact.SortOrder = input.SortOrder;
        fact.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        TempData["AdminContentSuccess"] = input.Id.HasValue ? "Admin_Content_Saved" : "Admin_Content_Added";
        return RedirectToContentSection("facts");
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteFact(AdminDeleteHomeFactInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminContentError"] = "Admin_Content_Error_Validation";
            return RedirectToContentSection("facts");
        }

        var fact = await _db.HomeFacts.FindAsync(input.Id);
        if (fact is null)
        {
            TempData["AdminContentError"] = "Admin_Content_Error_NotFound";
            return RedirectToContentSection("facts");
        }

        _db.HomeFacts.Remove(fact);
        await _db.SaveChangesAsync();

        TempData["AdminContentSuccess"] = "Admin_Content_Deleted";
        return RedirectToContentSection("facts");
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> SaveEvent(AdminUpsertHomeEventInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminContentError"] = "Admin_Content_Error_Validation";
            return RedirectToContentSection("events");
        }

        var title = (input.Title ?? string.Empty).Trim();
        var reward = (input.Reward ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(reward))
        {
            TempData["AdminContentError"] = "Admin_Content_Error_Validation";
            return RedirectToContentSection("events");
        }

        var startsAtUtc = input.StartsAt.Kind switch
        {
            DateTimeKind.Utc => input.StartsAt,
            DateTimeKind.Local => input.StartsAt.ToUniversalTime(),
            _ => DateTime.SpecifyKind(input.StartsAt, DateTimeKind.Local).ToUniversalTime()
        };

        var endsAtUtc = input.EndsAt.Kind switch
        {
            DateTimeKind.Utc => input.EndsAt,
            DateTimeKind.Local => input.EndsAt.ToUniversalTime(),
            _ => DateTime.SpecifyKind(input.EndsAt, DateTimeKind.Local).ToUniversalTime()
        };

        if (endsAtUtc <= startsAtUtc)
        {
            TempData["AdminContentError"] = "Admin_Content_Event_Error_Dates";
            return RedirectToContentSection("events");
        }

        if (input.GameId.HasValue)
        {
            var gameExists = await _db.Games.AnyAsync(g => g.Id == input.GameId.Value && g.ApprovalStatus == GameApprovalStatus.Approved);
            if (!gameExists)
            {
                TempData["AdminContentError"] = "Admin_Content_Event_Error_Game";
                return RedirectToContentSection("events");
            }
        }

        string? uploadedImagePath = null;
        if (input.Image is { Length: > 0 })
        {
            if (string.IsNullOrWhiteSpace(input.Image.ContentType) || !input.Image.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            {
                TempData["AdminContentError"] = "Admin_Content_Event_Error_Image";
                return RedirectToContentSection("events");
            }

            var extension = Path.GetExtension(input.Image.FileName);
            var fileName = $"event-{Guid.NewGuid():N}{extension}";
            await using var stream = input.Image.OpenReadStream();
            uploadedImagePath = await _fileStorage.SaveAsync(stream, fileName, "events");
        }

        HomeEvent homeEvent;

        if (input.Id.HasValue)
        {
            homeEvent = await _db.HomeEvents.FindAsync(input.Id.Value);
            if (homeEvent is null)
            {
                TempData["AdminContentError"] = "Admin_Content_Error_NotFound";
                return RedirectToContentSection("events");
            }
        }
        else
        {
            homeEvent = new HomeEvent
            {
                CreatedAtUtc = DateTime.UtcNow
            };
            await _db.HomeEvents.AddAsync(homeEvent);
        }

        homeEvent.Title = title;
        homeEvent.Reward = reward;
        homeEvent.StartsAtUtc = startsAtUtc;
        homeEvent.EndsAtUtc = endsAtUtc;
        homeEvent.IsActive = input.IsActive;
        homeEvent.SortOrder = input.SortOrder;
        homeEvent.GameId = input.GameId;
        if (!string.IsNullOrEmpty(uploadedImagePath))
        {
            homeEvent.ImagePath = uploadedImagePath;
        }
        else if (input.RemoveImage)
        {
            homeEvent.ImagePath = null;
        }
        homeEvent.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        TempData["AdminContentSuccess"] = input.Id.HasValue ? "Admin_Content_Saved" : "Admin_Content_Added";
        return RedirectToContentSection("events");
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteEvent(AdminDeleteHomeEventInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminContentError"] = "Admin_Content_Error_Validation";
            return RedirectToContentSection("events");
        }

        var homeEvent = await _db.HomeEvents.FindAsync(input.Id);
        if (homeEvent is null)
        {
            TempData["AdminContentError"] = "Admin_Content_Error_NotFound";
            return RedirectToContentSection("events");
        }

        _db.HomeEvents.Remove(homeEvent);
        await _db.SaveChangesAsync();

        TempData["AdminContentSuccess"] = "Admin_Content_Deleted";
        return RedirectToContentSection("events");
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> SaveFeaturedGame(AdminUpsertHomeFeaturedGameInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminContentError"] = "Admin_Content_Error_Validation";
            return RedirectToContentSection("feature");
        }

        var game = await _db.Games
            .AsNoTracking()
            .FirstOrDefaultAsync(g => g.Id == input.GameId && g.ApprovalStatus == GameApprovalStatus.Approved);

        if (game is null)
        {
            TempData["AdminContentError"] = "Admin_Content_Feature_Error_Game";
            return RedirectToContentSection("feature");
        }

        var startsAtUtc = input.StartsAt.Kind switch
        {
            DateTimeKind.Utc => input.StartsAt,
            DateTimeKind.Local => input.StartsAt.ToUniversalTime(),
            _ => DateTime.SpecifyKind(input.StartsAt, DateTimeKind.Local).ToUniversalTime()
        };

        var endsAtUtc = input.EndsAt.Kind switch
        {
            DateTimeKind.Utc => input.EndsAt,
            DateTimeKind.Local => input.EndsAt.ToUniversalTime(),
            _ => DateTime.SpecifyKind(input.EndsAt, DateTimeKind.Local).ToUniversalTime()
        };

        if (endsAtUtc <= startsAtUtc)
        {
            TempData["AdminContentError"] = "Admin_Content_Feature_Error_Dates";
            return RedirectToContentSection("feature");
        }

        HomeFeaturedGame feature;

        if (input.Id.HasValue)
        {
            feature = await _db.HomeFeaturedGames.FindAsync(input.Id.Value);
            if (feature is null)
            {
                TempData["AdminContentError"] = "Admin_Content_Error_NotFound";
                return RedirectToContentSection("feature");
            }
        }
        else
        {
            feature = new HomeFeaturedGame
            {
                CreatedAtUtc = DateTime.UtcNow
            };
            await _db.HomeFeaturedGames.AddAsync(feature);
        }

        feature.GameId = input.GameId;
        feature.CustomDescription = string.IsNullOrWhiteSpace(input.Description) ? null : input.Description.Trim();
        feature.StartsAtUtc = startsAtUtc;
        feature.EndsAtUtc = endsAtUtc;
        feature.IsActive = input.IsActive;
        feature.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        TempData["AdminContentSuccess"] = "Admin_Content_Saved";
        return RedirectToContentSection("feature");
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteFeaturedGame(AdminDeleteHomeFeaturedGameInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminContentError"] = "Admin_Content_Error_Validation";
            return RedirectToContentSection("feature");
        }

        var feature = await _db.HomeFeaturedGames.FindAsync(input.Id);
        if (feature is null)
        {
            TempData["AdminContentError"] = "Admin_Content_Error_NotFound";
            return RedirectToContentSection("feature");
        }

        _db.HomeFeaturedGames.Remove(feature);
        await _db.SaveChangesAsync();

        TempData["AdminContentSuccess"] = "Admin_Content_Deleted";
        return RedirectToContentSection("feature");
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteGame(AdminDeleteGameInputModel input)
    {
        if (!ModelState.IsValid)
        {
            TempData["AdminGamesError"] = "Admin_Games_Delete_Error";
            return RedirectToAction(nameof(Games));
        }

        var game = await _db.Games
            .Include(g => g.Tags)
            .Include(g => g.Versions)
            .Include(g => g.Reviews)
            .FirstOrDefaultAsync(g => g.Id == input.Id);

        if (game is null)
        {
            TempData["AdminGamesError"] = "Admin_Games_NotFound";
            return RedirectToAction(nameof(Games));
        }

        game.ApprovalStatus = GameApprovalStatus.Rejected;
        game.ApprovedAtUtc = null;
        game.RejectedAtUtc = game.RejectedAtUtc ?? DateTime.UtcNow;
        game.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        TempData["AdminGamesSuccess"] = "Admin_Games_Delete_Success";
        return RedirectToAction(nameof(Games));



public async Task<IActionResult> Logs(string? search = null, ActivityLogType? type = null, string? game = null, int page = 1)
    {
        const int pageSize = 100;
        var query = _db.ActivityLogs.AsNoTracking();

        if (type.HasValue)
        {
            query = query.Where(l => l.Type == type.Value);
        }

        List<Guid>? gameIds = null;
        if (!string.IsNullOrWhiteSpace(game))
        {
            var term = game.Trim();
            gameIds = await _db.Games
                .Where(g => EF.Functions.Like(g.Slug, $"%{term}%") || EF.Functions.Like(g.Title, $"%{term}%"))
                .Select(g => g.Id)
                .ToListAsync();
            if (gameIds.Count > 0)
            {
                query = query.Where(l => l.GameId.HasValue && gameIds.Contains(l.GameId.Value));
            }
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(l =>
                (l.ActorUserId != null && EF.Functions.Like(l.ActorUserId, $"%{term}%")) ||
                (l.TargetUserId != null && EF.Functions.Like(l.TargetUserId, $"%{term}%")) ||
                (l.Message != null && EF.Functions.Like(l.Message, $"%{term}%")));
        }

        var total = await query.CountAsync();
        page = Math.Max(1, page);
        var items = await query
            .OrderByDescending(l => l.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var userIds = items
            .SelectMany(l => new[] { l.ActorUserId, l.TargetUserId })
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();

        var userLookup = userIds.Count == 0
            ? new Dictionary<string, string>()
            : await _db.Users
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
                .ToDictionaryAsync(u => u.Id, u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id));

        var gameLookup = items
            .Where(l => l.GameId.HasValue)
            .Select(l => l.GameId!.Value)
            .Distinct()
            .ToDictionary(id => id, id => string.Empty);

        if (gameLookup.Count > 0)
        {
            var ids = gameLookup.Keys.ToList();
            var games = await _db.Games
                .Where(g => ids.Contains(g.Id))
                .Select(g => new { g.Id, g.Slug })
                .ToListAsync();
            foreach (var g in games)
            {
                gameLookup[g.Id] = g.Slug;
            }
        }

        var logs = items.Select(item => new AdminLogRowViewModel
        {
            Id = item.Id,
            CreatedAtUtc = item.CreatedAtUtc,
            Type = item.Type,
            ActorUserId = item.ActorUserId,
            TargetUserId = item.TargetUserId,
            ActorDisplayName = item.ActorUserId != null && userLookup.TryGetValue(item.ActorUserId, out var actorName) ? actorName : item.ActorUserId,
            TargetDisplayName = item.TargetUserId != null && userLookup.TryGetValue(item.TargetUserId, out var targetName) ? targetName : item.TargetUserId,
            GameId = item.GameId,
            GameSlug = item.GameId.HasValue && gameLookup.TryGetValue(item.GameId.Value, out var slug) ? slug : null,
            Rating = item.Rating,
            Message = item.Message
        }).ToList();

        var vm = new AdminLogsViewModel
        {
            Logs = logs,
            Search = search,
            Type = type,
            Game = game,
            Page = page,
            PageSize = pageSize,
            Total = total
        };

        return View(vm);
    }
}
}
