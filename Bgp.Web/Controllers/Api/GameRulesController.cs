using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;
using Bgp.Domain.Entities;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games/{gameId:guid}/rules")]
public class GameRulesController : ControllerBase
{
    private readonly AppDbContext _db;

    public GameRulesController(AppDbContext db)
    {
        _db = db;
    }

    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<object>> Get(Guid gameId, [FromQuery] string? lang = null)
    {
        var game = await _db.Games
            .Include(g => g.Locales)
            .FirstOrDefaultAsync(g => g.Id == gameId && g.ApprovalStatus == GameApprovalStatus.Approved);

        if (game is null)
        {
            return NotFound();
        }

        var requested = string.IsNullOrWhiteSpace(lang)
            ? System.Globalization.CultureInfo.CurrentUICulture.Name
            : lang;

        var locale = game.ResolveLocale(requested);
        var rules = locale?.RulesContent ?? game.Rules ?? string.Empty;
        var updated = locale?.UpdatedAtUtc ?? game.UpdatedAtUtc ?? game.CreatedAtUtc;

        return Ok(new
        {
            locale = locale?.Locale ?? game.DefaultLocale,
            rules_content = rules,
            updated_at = updated,
            version = updated.ToString("yyyyMMddHHmmss")
        });
    }

    public class UpdateRulesRequest
    {
        [Required]
        public string Content { get; set; } = string.Empty;

        public string? Locale { get; set; }
    }

    [Authorize(Roles = "Admin,Moderator")]
    [HttpPut]
    public async Task<ActionResult> Put(Guid gameId, [FromBody] UpdateRulesRequest request)
    {
        var game = await _db.Games
            .Include(g => g.Locales)
            .FirstOrDefaultAsync(g => g.Id == gameId);

        if (game is null)
        {
            return NotFound();
        }

        var content = (request.Content ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(content))
        {
            return BadRequest(new { code = "empty_rules", message = "Rules content cannot be empty." });
        }

        if (string.IsNullOrWhiteSpace(request.Locale) || string.Equals(request.Locale, game.DefaultLocale, StringComparison.OrdinalIgnoreCase))
        {
            game.Rules = content;
        }
        else
        {
            var locale = game.Locales.FirstOrDefault(l => l.Locale == request.Locale);
            if (locale is null)
            {
                locale = new Domain.Entities.GameLocale
                {
                    GameId = game.Id,
                    Locale = request.Locale,
                    Title = game.Title,
                    Description = game.Description,
                    RulesContent = content,
                    UpdatedAtUtc = DateTime.UtcNow
                };
                _db.GameLocales.Add(locale);
            }
            else
            {
                locale.RulesContent = content;
                locale.UpdatedAtUtc = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }
}