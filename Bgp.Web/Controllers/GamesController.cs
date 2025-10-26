using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Bgp.Web.Models;
using Bgp.Web.Resources;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.Controllers;

public class GamesController : Controller
{
    private readonly AppDbContext _db;
    private readonly IStringLocalizer<SharedResource> _localizer;

    public GamesController(AppDbContext db, IStringLocalizer<SharedResource> localizer)
    {
        _db = db;
        _localizer = localizer;
    }

    [AllowAnonymous]
    public async Task<IActionResult> Index(string? search = null, string? category = null, string? mode = null, string? tag = null)
    {
        var gamesQuery = _db.Games
            .AsNoTracking()
            .Include(g => g.Tags)
            .Where(g => g.ApprovalStatus == GameApprovalStatus.Approved);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            gamesQuery = gamesQuery.Where(g =>
                EF.Functions.Like(g.Title, term) ||
                EF.Functions.Like(g.Description ?? string.Empty, term));
        }

        var categoryFilter = ParseCategory(category);
        if (categoryFilter.HasValue && categoryFilter.Value != GameCategory.None)
        {
            var filter = categoryFilter.Value;
            gamesQuery = gamesQuery.Where(g => (g.Categories & filter) != 0);
        }

        var modeFilter = ParseMode(mode);
        if (modeFilter != GameMode.None)
        {
            gamesQuery = gamesQuery.Where(g => (g.Modes & modeFilter) != 0);
        }

        var normalizedTag = NormalizeTag(tag);
        if (!string.IsNullOrWhiteSpace(normalizedTag))
        {
            gamesQuery = gamesQuery.Where(g => g.Tags.Any(t => t.IsApproved && t.Value == normalizedTag));
        }

        var games = await gamesQuery
            .OrderByDescending(g => g.CreatedAtUtc)
            .Select(g => new GameCatalogItemViewModel(
                g.Id,
                g.Title,
                g.Slug,
                g.CoverImagePath,
                g.Reviews.Any() ? g.Reviews.Average(r => r.Stars) : 0.0,
                g.Modes,
                g.Categories,
                g.Tags.Where(t => t.IsApproved).OrderBy(t => t.Value).Select(t => t.Value).ToList()))
            .ToListAsync();

        var tagOptions = await _db.GameTags
            .AsNoTracking()
            .Where(t => t.IsApproved)
            .GroupBy(t => t.Value)
            .Select(g => new { Value = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ThenBy(x => x.Value)
            .Take(30)
            .ToListAsync();

        var vm = new GameCatalogViewModel
        {
            Games = games,
            Filters = new GameCatalogFilterModel
            {
                Search = search,
                Category = category,
                Mode = mode,
                Tag = normalizedTag
            },
            CategoryOptions = BuildCategoryFilterOptions(categoryFilter),
            ModeOptions = BuildModeFilterOptions(modeFilter),
            TagOptions = tagOptions
                .Select(t => new SelectListItem
                {
                    Value = t.Value,
                    Text = $"{t.Value} ({t.Count})",
                    Selected = string.Equals(t.Value, normalizedTag, StringComparison.OrdinalIgnoreCase)
                })
                .ToList()
        };

        return View(vm);
    }

    [Authorize]
    public async Task<IActionResult> Details(string slug)
    {
        var g = await _db.Games
            .Include(x => x.Versions)
            .Include(x => x.Tags)
            .FirstOrDefaultAsync(x => x.Slug == slug && x.ApprovalStatus == GameApprovalStatus.Approved);

        if (g is null)
        {
            return NotFound();
        }

        var latest = g.Versions.OrderByDescending(v => v.PublishedAtUtc).FirstOrDefault();
        ViewBag.PlayUrl = latest is null ? null : $"{latest.ContentPath.TrimEnd('/')}/index.html";
        return View(g);
    }

    private IReadOnlyList<SelectListItem> BuildCategoryFilterOptions(GameCategory? selected)
    {
        return GameMetadataOptions.CategoryDefinitions
            .Select(option => new SelectListItem
            {
                Value = ((int)option.Category).ToString(CultureInfo.InvariantCulture),
                Text = _localizer[option.ResourceKey],
                Selected = selected.HasValue && option.Category == selected.Value
            })
            .ToList();
    }

    private IReadOnlyList<SelectListItem> BuildModeFilterOptions(GameMode selected)
    {
        return GameMetadataOptions.ModeDefinitions
            .Select(option => new SelectListItem
            {
                Value = ((int)option.Mode).ToString(CultureInfo.InvariantCulture),
                Text = _localizer[option.ResourceKey],
                Selected = (selected & option.Mode) != 0
            })
            .ToList();
    }

    private static GameCategory? ParseCategory(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numeric) && Enum.IsDefined(typeof(GameCategory), numeric))
        {
            return (GameCategory)numeric;
        }

        if (Enum.TryParse<GameCategory>(raw, true, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static GameMode ParseMode(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return GameMode.None;
        }

        if (int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numeric) && Enum.IsDefined(typeof(GameMode), numeric))
        {
            return (GameMode)numeric;
        }

        if (Enum.TryParse<GameMode>(raw, true, out var parsed))
        {
            return parsed;
        }

        return GameMode.None;
    }

    private static string? NormalizeTag(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var value = raw.Trim().ToLowerInvariant();
        value = Regex.Replace(value, "[^a-z0-9#+-]", " ");
        value = Regex.Replace(value, "\\s+", " ").Trim();
        if (value.Length < 2)
        {
            return null;
        }

        return value.Length > 40 ? value[..40] : value;
    }
}
