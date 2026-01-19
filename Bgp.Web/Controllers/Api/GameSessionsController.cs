using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Bgp.Web.Helpers;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Services;
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
    private readonly IActivityLogger _logger;
    private const int MaxMultiplayerPlayers = 2;

    public GameSessionsController(AppDbContext db, IStringLocalizer<SharedResource> localizer, IActivityLogger logger)
    {
        _db = db;
        _localizer = localizer;
        _logger = logger;
    }

    public class CreateSessionRequest
    {
        [Range(1, int.MaxValue)]
        public int Mode { get; set; } = (int)GameMode.Singleplayer;
    }

    public class SubmitSessionScoreRequest
    {
        [Required]
        public string Token { get; set; } = string.Empty;

        [Range(0, double.MaxValue)]
        public double Value { get; set; }

        public string? Outcome { get; set; }
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
        var now = DateTime.UtcNow;
        var session = mode == GameMode.Singleplayer
            ? null
            : await FindAvailableSessionAsync(gameId, mode, userId, now);
        var isNewSession = session is null;
        var token = SessionTokenUtilities.GenerateToken();
        var tokenHash = SessionTokenUtilities.HashToken(token);

        if (session is null)
        {
            session = new MatchSession
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
        }

        var existingPlayer = await _db.SessionPlayers
            .FirstOrDefaultAsync(p => p.SessionId == session.Id && p.UserId == userId);
        if (existingPlayer is null)
        {
            _db.SessionPlayers.Add(new SessionPlayer
            {
                SessionId = session.Id,
                UserId = userId,
                TokenHash = tokenHash,
                Role = isNewSession ? "host" : "guest",
                JoinedAtUtc = now
            });
        }
        else
        {
            existingPlayer.TokenHash = tokenHash;
            existingPlayer.JoinedAtUtc = now;
        }

        await _db.SaveChangesAsync();

        if (isNewSession)
        {
            await _logger.LogAsync(ActivityLogType.GameSessionCreated, userId, log =>
            {
                log.GameId = gameId;
                log.InviteId = null;
                log.TargetUserId = null;
            });
        }

        var joinUrl = Url.Action("Details", "Games", new { slug = game.Slug, tab = "play", sessionId = session.Id, token }, Request.Scheme);

        return Created(string.Empty, new
        {
            session_id = session.Id,
            token,
            join_url = joinUrl,
            ws_url = session.WsUrl
        });
    }


    private async Task<MatchSession?> FindAvailableSessionAsync(Guid gameId, GameMode mode, string userId, DateTime now)
    {
        var sessionId = await _db.SessionPlayers
            .Where(player => player.Session.GameId == gameId
                && player.Session.Mode == mode
                && player.Session.ExpiresAtUtc > now)
            .GroupBy(player => player.SessionId)
            .Select(group => new
            {
                SessionId = group.Key,
                PlayerCount = group.Count(),
                HasUser = group.Any(player => player.UserId == userId)
            })
            .Where(group => group.HasUser || group.PlayerCount < MaxMultiplayerPlayers)
            .OrderByDescending(group => group.HasUser)
            .ThenBy(group => group.PlayerCount)
            .Select(group => group.SessionId)
            .FirstOrDefaultAsync();

        if (sessionId == Guid.Empty)
        {
            return null;
        }

        return await _db.MatchSessions.FirstOrDefaultAsync(session =>
            session.Id == sessionId && session.ExpiresAtUtc > now);
    }

    [AllowAnonymous]
    [HttpPost("{sessionId:guid}/score")]
    public async Task<ActionResult> SubmitScore(Guid gameId, Guid sessionId, [FromBody] SubmitSessionScoreRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            return Unauthorized();
        }

        if (!double.IsFinite(request.Value) || request.Value < 0)
        {
            return BadRequest("Nieprawidłowy wynik.");
        }

        var session = await _db.MatchSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId);
        if (session is null)
        {
            return NotFound();
        }
        if (session.GameId != gameId)
        {
            return BadRequest("Nieprawidłowe powiązanie gry z sesją.");
        }

        var tokenHash = SessionTokenUtilities.HashToken(request.Token);
        var player = await _db.SessionPlayers
            .FirstOrDefaultAsync(p => p.SessionId == sessionId && p.TokenHash == tokenHash);
        if (player is null)
        {
            return Unauthorized();
        }

        if (!string.IsNullOrWhiteSpace(request.Outcome))
        {
            var normalized = request.Outcome.Trim().ToLowerInvariant();
            var role = normalized switch
            {
                "win" => "winner",
                "loss" => "loser",
                "draw" => "draw",
                _ => null
            };
            if (role is null)
            {
                return BadRequest("Nieprawidłowy wynik meczu.");
            }
            player.Role = role;
        }

        var existingScore = await _db.Scores
            .FirstOrDefaultAsync(s => s.MatchSessionId == sessionId && s.UserId == player.UserId);

        if (existingScore is null)
        {
            _db.Scores.Add(new Score
            {
                GameId = gameId,
                MatchSessionId = sessionId,
                UserId = player.UserId,
                Mode = session.Mode,
                Value = request.Value,
                Verified = true,
                SubmittedAtUtc = DateTime.UtcNow
            });
        }
        else
        {
            existingScore.Value = request.Value;
            existingScore.Verified = true;
            existingScore.Mode = session.Mode;
            existingScore.SubmittedAtUtc = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        return Ok(new { session_id = sessionId });
    }

    [Authorize]
    [HttpPost("{sessionId:guid}/leave")]
    public async Task<ActionResult> Leave(Guid gameId, Guid sessionId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var session = await _db.MatchSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.GameId == gameId);
        if (session is null)
        {
            return NotFound();
        }

        var player = await _db.SessionPlayers
            .FirstOrDefaultAsync(p => p.SessionId == sessionId && p.UserId == userId);
        if (player is not null)
        {
            var hasScore = await _db.Scores.AnyAsync(s => s.MatchSessionId == sessionId
                                                         && s.UserId == userId);
            if (!hasScore)
            {
                _db.Scores.Add(new Score
                {
                    GameId = gameId,
                    MatchSessionId = sessionId,
                    UserId = userId,
                    Mode = session.Mode,
                    Value = 0,
                    Verified = true,
                    SubmittedAtUtc = DateTime.UtcNow
                });
            }
        }

        var now = DateTime.UtcNow;
        if (string.Equals(session.UserId, userId, StringComparison.OrdinalIgnoreCase))
        {
            session.ExpiresAtUtc = now;
        }
        else
        {
            var remainingPlayers = await _db.SessionPlayers.AnyAsync(p => p.SessionId == sessionId && p.UserId != userId);
            if (!remainingPlayers)
            {
                session.ExpiresAtUtc = now;
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new { session_id = sessionId, expires_at = session.ExpiresAtUtc });
    }
}