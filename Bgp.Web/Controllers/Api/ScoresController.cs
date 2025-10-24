using System.Security.Claims;
using Bgp.Application.Dtos;
using Bgp.Application.Interfaces;
using Bgp.Domain.Entities;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games/{gameId:guid}/scores")]
public class ScoresController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IScoreSigner _signer;
    private readonly IDateTimeProvider _time;

    public ScoresController(AppDbContext db, IScoreSigner signer, IDateTimeProvider time)
    {
        _db = db;
        _signer = signer;
        _time = time;
    }

    [Authorize]
    [HttpPost("start-session")]
    public async Task<ActionResult<StartSessionResponse>> StartSession(Guid gameId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        if (!await _db.Games.AnyAsync(g => g.Id == gameId)) return NotFound();

        var key = Convert.ToBase64String(Guid.NewGuid().ToByteArray());
        var session = new MatchSession
        {
            GameId = gameId,
            UserId = userId,
            CreatedAtUtc = _time.UtcNow,
            ExpiresAtUtc = _time.UtcNow.AddMinutes(10),
            EphemeralKey = key
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

        var session = await _db.MatchSessions.FirstOrDefaultAsync(s => s.Id == req.SessionId && s.GameId == gameId && s.UserId == userId);
        if (session is null) return BadRequest("Nieprawidłowa sesja.");
        if (session.Used || session.ExpiresAtUtc < _time.UtcNow) return BadRequest("Sesja wygasła lub została użyta.");

        var sig = _signer.ComputeSignature(session.EphemeralKey, session.Id, req.Score);
        if (!string.Equals(sig, req.Signature, StringComparison.Ordinal))
            return BadRequest("Nieprawidłowy podpis wyniku.");

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
        session.Used = true;
        await _db.SaveChangesAsync();

        return Ok(new { score.Id, score.Value, score.SubmittedAtUtc });
    }
}
