using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/sessions")]
public class SessionInfoController : ControllerBase
{
    private readonly AppDbContext _db;

    public SessionInfoController(AppDbContext db) => _db = db;

    [HttpGet("{sessionId:guid}/me")]
    public async Task<ActionResult> GetMe(Guid sessionId)
    {
        if (!SessionTokenUtilities.TryGetBearerToken(Request, out var token))
        {
            return Unauthorized();
        }

        var session = await _db.MatchSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sessionId);
        if (session is null)
        {
            return NotFound();
        }

        var tokenHash = SessionTokenUtilities.HashToken(token);
        var player = await _db.SessionPlayers.AsNoTracking().FirstOrDefaultAsync(p => p.TokenHash == tokenHash);
        if (player is null)
        {
            return Unauthorized();
        }

        if (player.SessionId != sessionId)
        {
            return Forbid();
        }

        var user = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == player.UserId)
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
            .FirstOrDefaultAsync();

        if (user is null)
        {
            return NotFound();
        }

        var nick = DisplayNameFormatter.Format(user.DisplayName, user.Email, user.UserName, user.Id);
        return Ok(new { userId = user.Id, nick });
    }
}