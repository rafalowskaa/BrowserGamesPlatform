using Bgp.Domain.Enums;
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
}