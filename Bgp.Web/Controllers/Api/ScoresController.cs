using System;
using System.Security.Claims;
using System.Security.Cryptography;
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

        var key = SessionTokenUtilities.GenerateToken();
        var keyHash = SessionTokenUtilities.HashToken(key);
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
        _db.SessionPlayers.Add(new SessionPlayer
        {
            SessionId = session.Id,
            UserId = userId,
            TokenHash = keyHash,
            Role = "host",
            JoinedAtUtc = _time.UtcNow
        });
        await _db.SaveChangesAsync();

        return Ok(new StartSessionResponse(session.Id, key, session.ExpiresAtUtc));
    }

    [AllowAnonymous]
    [HttpPost]
    public async Task<ActionResult> Submit(Guid gameId, [FromBody] SubmitScoreRequest req)
    {
        if (!SessionTokenUtilities.TryGetBearerToken(Request, out var token))
        {
            return Unauthorized();
        }

        var tokenHash = SessionTokenUtilities.HashToken(token);

        var session = await _db.MatchSessions.FirstOrDefaultAsync(s => s.Id == req.SessionId);
        if (session is null) return NotFound();
        if (session.GameId != gameId) return BadRequest("Nieprawidłowe powiązanie gry z sesją.");
        if (session.ExpiresAtUtc < _time.UtcNow) return BadRequest("Sesja wygasła lub została użyta.");

        GameMode requestedMode;
        if (string.IsNullOrWhiteSpace(req.Mode))
        {
            requestedMode = session.Mode;
        }
        else if (!TryParseMode(req.Mode, out requestedMode))
        {
            return BadRequest("Nieprawidłowy tryb gry.");
        }

        var tokenOwner = await _db.SessionPlayers
            .FirstOrDefaultAsync(p => p.TokenHash == tokenHash);
        if (tokenOwner is null) return Unauthorized();
        if (tokenOwner.SessionId != session.Id) return Forbid();

        var userId = tokenOwner.UserId;
        var existingScore = await _db.Scores
            .FirstOrDefaultAsync(s => s.MatchSessionId == session.Id && s.UserId == userId && s.GameId == gameId && s.Mode == requestedMode);

        var isSingleplayer = session.Mode == GameMode.Singleplayer;
        if (isSingleplayer && session.Used && existingScore is null) return BadRequest("Sesja wygasła lub została użyta.");

        if (!double.IsFinite(req.Score) || req.Score < 0)
        {
            return BadRequest("Nieprawidłowy wynik.");
        }
        if (session.Mode != requestedMode)
        {
            return BadRequest("Niezgodny tryb gry.");
        }

        var sig = _signer.ComputeSignature(token, session.Id, req.Score);
        var normalizedSignature = (req.Signature ?? string.Empty).Trim().ToUpperInvariant();
        if (!FixedTimeEquals(sig, normalizedSignature))
            return BadRequest("Nieprawidłowy podpis wyniku.");

        var previousXp = await CalculateGameXpAsync(gameId, userId);

        Score score;
        if (existingScore is null)
        {
            score = new Score
            {
                GameId = gameId,
                UserId = userId,
                Mode = requestedMode,
                Value = req.Score,
                SubmittedAtUtc = _time.UtcNow,
                MatchSessionId = session.Id,
                Verified = true
            };
            _db.Scores.Add(score);
        }
        else
        {
            existingScore.Mode = requestedMode;
            existingScore.Value = req.Score;
            existingScore.SubmittedAtUtc = _time.UtcNow;
            existingScore.Verified = true;
            score = existingScore;
        }
        if (isSingleplayer)
        {
            session.Used = true;
        }
        await _db.SaveChangesAsync();

        await UpdateSessionOutcomeAsync(session.Id);
        var matchExperience = await GetMatchExperienceAsync(session.Id, userId);
        await AwardMatchExperienceAsync(session.Id, gameId);

        var currentXp = await CalculateGameXpAsync(gameId, userId);
        var gainedXp = Math.Max(0, currentXp - previousXp);
        if (matchExperience > 0 && gainedXp > 0)
        {
            gainedXp = Math.Max(0, gainedXp - matchExperience);
        }
        if (gainedXp > 0)
        {
            await _logger.LogAsync(ActivityLogType.ExperienceGained, userId, log =>
            {
                log.GameId = gameId;
                log.TargetUserId = userId;
                log.Message = ExperienceLogFormatter.BuildMessage(gainedXp, "ranking", "score");
            });
        }

        return Ok(new { score.Id, score.Value, score.SubmittedAtUtc });
    }

    private static bool TryParseMode(string mode, out GameMode parsed)
    {
        if (string.IsNullOrWhiteSpace(mode))
        {
            parsed = GameMode.None;
            return false;
        }

        if (Enum.TryParse<GameMode>(mode, true, out parsed) && parsed != GameMode.None)
        {
            return true;
        }

        if (int.TryParse(mode, out var numeric) && Enum.IsDefined(typeof(GameMode), numeric))
        {
            parsed = (GameMode)numeric;
            return parsed != GameMode.None;
        }

        parsed = GameMode.None;
        return false;
    }

    private async Task UpdateSessionOutcomeAsync(Guid sessionId)
    {
        var players = await _db.SessionPlayers
            .Where(p => p.SessionId == sessionId)
            .ToListAsync();
        if (players.Count <= 1)
        {
            return;
        }

        var scores = await _db.Scores
            .Where(s => s.MatchSessionId == sessionId && s.Verified)
            .Select(s => new { s.UserId, s.Value })
            .ToListAsync();

        var distinctUsers = players.Select(p => p.UserId).Distinct(StringComparer.Ordinal).ToList();
        if (scores.Select(s => s.UserId).Distinct(StringComparer.Ordinal).Count() < distinctUsers.Count)
        {
            return;
        }

        var topScore = scores.Max(s => s.Value);
        var isDraw = scores.All(s => s.Value.Equals(topScore));
        foreach (var player in players)
        {
            var score = scores.FirstOrDefault(s => s.UserId == player.UserId);
            if (score is null)
            {
                player.Role = "dnf";
                continue;
            }

            if (isDraw)
            {
                player.Role = "draw";
            }
            else
            {
                player.Role = score.Value.Equals(topScore) ? "winner" : "loser";
            }
        }

        var session = await _db.MatchSessions.FirstOrDefaultAsync(s => s.Id == sessionId);
        if (session is not null)
        {
            session.ExpiresAtUtc = _time.UtcNow;
        }

        await _db.SaveChangesAsync();
    }

    private static bool FixedTimeEquals(string left, string right)
    {
        if (left.Length != right.Length)
        {
            return false;
        }

        var leftBytes = System.Text.Encoding.UTF8.GetBytes(left);
        var rightBytes = System.Text.Encoding.UTF8.GetBytes(right);
        return CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
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
        var matchExperience = await GetMatchExperienceForGameAsync(gameId, userId);
        return RankCalculator.CalculateGameExperience(entry.Matches, position, rows.Count, matchExperience);
    }

    private async Task<int> GetMatchExperienceAsync(Guid sessionId, string userId)
    {
        var role = await _db.SessionPlayers
            .Where(p => p.SessionId == sessionId && p.UserId == userId)
            .Select(p => p.Role)
            .FirstOrDefaultAsync();

        return role switch
        {
            "winner" => RankCalculator.MatchWinExperience,
            "loser" => RankCalculator.MatchLossExperience,
            "draw" => RankCalculator.MatchDrawExperience,
            _ => 0
        };
    }

    private async Task<int> GetMatchExperienceForGameAsync(Guid gameId, string userId)
    {
        var summary = await _db.SessionPlayers
            .Where(p => p.UserId == userId)
            .Join(_db.MatchSessions,
                player => player.SessionId,
                session => session.Id,
                (player, session) => new { session.GameId, player.Role })
            .Where(entry => entry.GameId == gameId)
            .GroupBy(_ => 1)
            .Select(group => new
            {
                Wins = group.Count(entry => entry.Role == "winner"),
                Losses = group.Count(entry => entry.Role == "loser"),
                Draws = group.Count(entry => entry.Role == "draw")
            })
            .FirstOrDefaultAsync();

        return summary is null
            ? 0
            : RankCalculator.CalculateMatchExperience(summary.Wins, summary.Losses, summary.Draws);
    }

    private async Task AwardMatchExperienceAsync(Guid sessionId, Guid gameId)
    {
        var players = await _db.SessionPlayers
            .Where(p => p.SessionId == sessionId)
            .Select(p => new { p.UserId, p.Role })
            .ToListAsync();

        if (players.Count <= 1)
        {
            return;
        }

        var reference = sessionId.ToString("N", CultureInfo.InvariantCulture);

        foreach (var player in players)
        {
            var amount = player.Role switch
            {
                "winner" => RankCalculator.MatchWinExperience,
                "loser" => RankCalculator.MatchLossExperience,
                "draw" => RankCalculator.MatchDrawExperience,
                _ => 0
            };

            if (amount <= 0)
            {
                continue;
            }

            var alreadyLogged = await _db.ActivityLogs
                .AsNoTracking()
                .AnyAsync(log =>
                    log.Type == ActivityLogType.ExperienceGained
                    && log.GameId == gameId
                    && log.TargetUserId == player.UserId
                    && log.Message != null
                    && log.Message.EndsWith(reference, StringComparison.Ordinal));

            if (alreadyLogged)
            {
                continue;
            }

            await _logger.LogAsync(ActivityLogType.ExperienceGained, player.UserId, log =>
            {
                log.GameId = gameId;
                log.TargetUserId = player.UserId;
                log.Message = ExperienceLogFormatter.BuildMessage(amount, "match", player.Role, reference);
            });
        }
    }
}
