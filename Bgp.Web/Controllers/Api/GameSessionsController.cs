using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Security.Cryptography;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Resources;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games/{gameId:guid}/sessions")]
public class GameSessionsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IStringLocalizer<SharedResource> _localizer;

    public GameSessionsController(AppDbContext db, IStringLocalizer<SharedResource> localizer)
    {
        _db = db;
        _localizer = localizer;
    }

    public class CreateSessionRequest
    {
        [Range(1, int.MaxValue)]
        public int Mode { get; set; } = (int)GameMode.Singleplayer;
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult> Create(Guid gameId, [FromBody] CreateSessionRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var game = await _db.Games.FirstOrDefaultAsync(g => g.Id == gameId && g.ApprovalStatus == GameApprovalStatus.Approved);
        if (game is null)
        {
            return NotFound();
        }

        if (!Enum.IsDefined(typeof(GameMode), request.Mode) || request.Mode == (int)GameMode.None)
        {
            return BadRequest(new { code = "invalid_mode", message = _localizer["Games_Details_Mode_Unspecified"].Value });
        }

        var mode = (GameMode)request.Mode;
        if (game.Modes != GameMode.None && (game.Modes & mode) == 0)
        {
            return BadRequest(new { code = "mode_not_available", message = _localizer["Games_Details_Mode_Unspecified"].Value });
        }

        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var now = DateTime.UtcNow;
        var session = new MatchSession
        {
            GameId = gameId,
            UserId = userId,
            Mode = mode,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddMinutes(30),
            Token = token,
            WsUrl = "/hubs/invites"
        };

        _db.MatchSessions.Add(session);
        _db.SessionPlayers.Add(new SessionPlayer
        {
            SessionId = session.Id,
            UserId = userId,
            Role = "host",
            JoinedAtUtc = now
        });

        await _db.SaveChangesAsync();

        var joinUrl = Url.Action("Details", "Games", new { slug = game.Slug, tab = "play", sessionId = session.Id, token }, Request.Scheme);

        return Created(string.Empty, new
        {
            session_id = session.Id,
            token,
            join_url = joinUrl,
            ws_url = session.WsUrl
        });
    }
}