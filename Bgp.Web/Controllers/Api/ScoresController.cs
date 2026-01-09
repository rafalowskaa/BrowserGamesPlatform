using System;
using System.Security.Claims;
using Bgp.Application.Dtos;
using Bgp.Application.Interfaces;
using Bgp.Domain.Enums;
using Bgp.Domain.Entities;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Globalization;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games/{gameId:guid}/scores")]
public class ScoresController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IScoreSigner _signer;
    private readonly IDateTimeProvider _time;
    private readonly IActivityLogger _logger;

    public ScoresController(AppDbContext db, IScoreSigner signer, IDateTimeProvider time, IActivityLogger logger)
    {
        _db = db;
        _signer = signer;
        _time = time;
        _logger = logger;
    }

    [Authorize]
    [HttpPost("start-session")]
    public async Task<ActionResult<StartSessionResponse>> StartSession(Guid gameId, [FromQuery] GameMode mode = GameMode.Singleplayer)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        if (!await _db.Games.AnyAsync(g => g.Id == gameId)) return NotFound();

        if (!Enum.IsDefined(typeof(GameMode), mode))
        {
            return BadRequest("Nieprawidłowy tryb gry.");
        }

        var key = Convert.ToBase64String(Guid.NewGuid().ToByteArray());
        var session = new MatchSession
        {
            GameId = gameId,
            UserId = userId,
            Mode = mode,
            CreatedAtUtc = _time.UtcNow,
            ExpiresAtUtc = _time.UtcNow.AddMinutes(10),
            Token = key
        };
        _db.MatchSessions.Add(session);
        await _db.SaveChangesAsync();

        return Ok(new StartSessionResponse(session.Id, key, session.ExpiresAtUtc));
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult> Submit(Guid gameId, [FromBody] SubmitScoreRequest req)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var session = await _db.MatchSessions.FirstOrDefaultAsync(s => s.Id == req.SessionId && s.GameId == gameId);
        if (session is null) return BadRequest("Nieprawidłowa sesja.");
        if (session.ExpiresAtUtc < _time.UtcNow) return BadRequest("Sesja wygasła lub została użyta.");

        var isParticipant = string.Equals(session.UserId, userId, StringComparison.OrdinalIgnoreCase)
            || await _db.SessionPlayers.AnyAsync(p => p.SessionId == session.Id && p.UserId == userId);
        if (!isParticipant) return Forbid();

        var hasExistingScore = await _db.Scores.AnyAsync(s => s.MatchSessionId == session.Id && s.UserId == userId);
        if (hasExistingScore) return BadRequest("Wynik został już zapisany.");

        var isSingleplayer = session.Mode == GameMode.Singleplayer;
        if (isSingleplayer && session.Used) return BadRequest("Sesja wygasła lub została użyta.");

        if (!double.IsFinite(req.Score) || req.Score < 0)
        {
            return BadRequest("Nieprawidłowy wynik.");
        }
        if (session.Mode != req.Mode)
        {
            return BadRequest("Niezgodny tryb gry.");
        }

        var sig = _signer.ComputeSignature(session.Token, session.Id, req.Score);
        if (!string.Equals(sig, req.Signature, StringComparison.Ordinal))
            return BadRequest("Nieprawidłowy podpis wyniku.");

        var previousXp = await CalculateGameXpAsync(gameId, userId);

        var score = new Score
        {
            GameId = gameId,
            UserId = userId,
            Mode = req.Mode,
            Value = req.Score,
            SubmittedAtUtc = _time.UtcNow,
            MatchSessionId = session.Id,
            Verified = true
        };

        _db.Scores.Add(score);
        if (isSingleplayer)
        {
            session.Used = true;
        }
        await _db.SaveChangesAsync();

        var currentXp = await CalculateGameXpAsync(gameId, userId);
        var gainedXp = Math.Max(0, currentXp - previousXp);
        if (gainedXp > 0)
        {
            await _logger.LogAsync(ActivityLogType.ExperienceGained, userId, log =>
            {
                log.GameId = gameId;
                log.TargetUserId = userId;
                log.Message = gainedXp.ToString(CultureInfo.InvariantCulture);
            });
        }

        return Ok(new { score.Id, score.Value, score.SubmittedAtUtc });
    }

    private async Task<int> CalculateGameXpAsync(Guid gameId, string userId)
    {
        var rows = await _db.Scores
            .Where(s => s.GameId == gameId && s.Verified)
            .GroupBy(s => s.UserId)
            .Select(g => new
            {
                UserId = g.Key,
                Best = g.Max(s => s.Value),
                Matches = g.Select(s => s.MatchSessionId).Distinct().Count()
            })
            .OrderByDescending(r => r.Best)
            .ToListAsync();

        if (rows.Count == 0)
        {
            return 0;
        }

        var index = rows.FindIndex(r => string.Equals(r.UserId, userId, StringComparison.Ordinal));
        if (index < 0)
        {
            return 0;
        }

        var entry = rows[index];
        var position = index + 1;
        return RankCalculator.CalculateGameExperience(entry.Matches, position, rows.Count);
    }
}
