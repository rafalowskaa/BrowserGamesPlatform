using System.Security.Claims;
using System.Collections.Generic;
using Bgp.Application.Dtos;
using System.Linq;
using System.Text.RegularExpressions;
using Bgp.Application.Interfaces;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games")]
public class GamesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IFileStorage _storage;

    public GamesController(AppDbContext db, IFileStorage storage)
    {
        _db = db;
        _storage = storage;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<GameListItemDto>>> Get([FromQuery] string? q)
    {
        var query = _db.Games
            .Include(g => g.Reviews)
            .AsNoTracking()
            .Where(g => g.ApprovalStatus == GameApprovalStatus.Approved);

        if (!string.IsNullOrWhiteSpace(q))
            query = query.Where(g => g.Title.Contains(q));

        var list = await query
            .OrderByDescending(g => g.CreatedAtUtc)
            .Select(g => new GameListItemDto(
                g.Id, g.Title, g.Slug, g.CoverImagePath,
                g.Reviews.Any() ? g.Reviews.Average(r => r.Stars) : 0,
                g.Reviews.Count, g.Modes, g.Categories,
                g.Tags.Where(t => t.IsApproved).OrderBy(t => t.Value).Select(t => t.Value).ToList()))
            .ToListAsync();

        return Ok(list);
    }

    [HttpGet("{slug}")]
    public async Task<ActionResult<object>> GetBySlug(string slug)
    {
        var g = await _db.Games
            .Include(x => x.Versions)
            .Include(x => x.Reviews)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Slug == slug && x.ApprovalStatus == GameApprovalStatus.Approved);

        if (g is null) return NotFound();

        var latest = g.Versions.OrderByDescending(v => v.PublishedAtUtc).FirstOrDefault();

        return Ok(new
        {
            g.Id,
            g.Title,
            g.Slug,
            g.Description,
            g.Modes,
            g.Categories,
            g.CoverImagePath,
            LatestVersion = latest?.Version,
            PlayUrl = latest?.ContentPath is null ? null : $"{latest.ContentPath.TrimEnd('/')}/index.html",
            AvgRating = g.Reviews.Any() ? g.Reviews.Average(r => r.Stars) : 0,
            ReviewsCount = g.Reviews.Count,
            Tags = g.Tags.Where(t => t.IsApproved).OrderBy(t => t.Value).Select(t => t.Value).ToList()
        });
    }

    [Authorize]
    [HttpPost]
    [RequestSizeLimit(10_000_000)]
    public async Task<ActionResult> Create([FromForm] CreateGameDto dto, IFormFile? cover)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var slug = Slugify(dto.Title);
        if (await _db.Games.AnyAsync(g => g.Slug == slug))
            return Conflict($"Gra o slug '{slug}' już istnieje.");

        string? coverPath = null;
        if (cover is not null && cover.Length > 0)
            coverPath = await _storage.SaveAsync(cover.OpenReadStream(), cover.FileName, "covers");

        var proposedModes = GameMode.None;
        if (dto.Modes is not null)
        {
            foreach (var mode in dto.Modes.Where(m => m != GameMode.None))
            {
                proposedModes |= mode;
            }
        }

        if (proposedModes == GameMode.None)
        {
            proposedModes = GameMode.Singleplayer;
        }

        var proposedCategories = GameCategory.None;
        if (dto.Categories is not null)
        {
            foreach (var category in dto.Categories.Where(c => c != GameCategory.None))
            {
                proposedCategories |= category;
            }
        }

        var sanitizedTags = SanitizeTags(dto.Tags);

        var game = new Game
        {
            Title = dto.Title.Trim(),
            Slug = slug,
            Description = dto.Description?.Trim(),
            Modes = GameMode.None,
            ProposedModes = proposedModes,
            Categories = GameCategory.None,
            ProposedCategories = proposedCategories == GameCategory.None ? GameCategory.Indie : proposedCategories,
            CoverImagePath = coverPath,
            CreatedByUserId = userId,
            ApprovalStatus = GameApprovalStatus.Pending
        };

        foreach (var tag in sanitizedTags)
        {
            game.Tags.Add(new GameTag
            {
                Value = tag,
                IsApproved = false,
                AddedByUserId = userId,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        _db.Games.Add(game);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetBySlug), new { slug = game.Slug }, new { game.Id, game.Slug });
    }

    private static IReadOnlyList<string> SanitizeTags(IEnumerable<string>? tags)
    {
        if (tags is null)
        {
            return Array.Empty<string>();
        }

        var cleaned = new List<string>();
        foreach (var tag in tags)
        {
            if (string.IsNullOrWhiteSpace(tag))
            {
                continue;
            }

            var value = Regex.Replace(tag.Trim(), "[^a-zA-Z0-9#+-]", " ");
            value = Regex.Replace(value, "\\s+", " ").Trim();
            if (value.Length < 2)
            {
                continue;
            }

            if (value.Length > 40)
            {
                value = value[..40];
            }

            value = value.ToLowerInvariant();
            if (!cleaned.Contains(value, StringComparer.OrdinalIgnoreCase))
            {
                cleaned.Add(value);
            }

            if (cleaned.Count >= 10)
            {
                break;
            }
        }

        return cleaned;
    }

    [Authorize]
    [HttpPost("{id:guid}/versions")]
    [RequestSizeLimit(200_000_000)]
    public async Task<ActionResult> UploadVersion(Guid id, [FromForm] CreateGameVersionDto dto, IFormFile package)
    {
        var game = await _db.Games.FindAsync(id);
        if (game is null) return NotFound();

        if (package is null || package.Length == 0) return BadRequest("Brak pliku z paczką gry (.zip).");
        var ext = Path.GetExtension(package.FileName).ToLowerInvariant();
        if (ext != ".zip") return BadRequest("Oczekiwano pliku .zip z zawartością gry (index.html etc).");

        var target = $"games/{game.Slug}/{dto.Version}";
        await _storage.ExtractZipAsync(package.OpenReadStream(), target);

        var gv = new GameVersion
        {
            GameId = id,
            Version = dto.Version,
            Changelog = dto.Changelog,
            ContentPath = "/" + target.TrimStart('/')
        };

        _db.GameVersions.Add(gv);
        await _db.SaveChangesAsync();

        return Ok(new { gv.Id, gv.Version, gv.ContentPath });
    }

    private static string Slugify(string text)
    {
        var slug = new string(text
            .ToLowerInvariant()
            .Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')
            .ToArray());
        while (slug.Contains("--")) slug = slug.Replace("--", "-");
        return slug.Trim('-');
    }
}
