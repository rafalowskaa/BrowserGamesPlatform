using Bgp.Application.Dtos;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games/{gameId:guid}/leaderboard")]
public class LeaderboardsController : ControllerBase
{
    private readonly AppDbContext _db;

    public LeaderboardsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<LeaderboardRowDto>>> Get(Guid gameId, [FromQuery] int top = 20)
    {
        var rows = await GetRowsAsync(gameId, top);
        return Ok(rows);
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(Guid gameId, [FromQuery] int top = 100)
    {
        var rows = (await GetRowsAsync(gameId, top)).ToList();
        if (rows.Count == 0)
        {
            return File(Encoding.UTF8.GetBytes("UserName,BestScore"), "text/csv", $"leaderboard-{gameId}.csv");
        }

        var sb = new StringBuilder();
        sb.AppendLine("UserName,BestScore");
        foreach (var row in rows)
        {
            var name = QuoteCsv(row.UserName);
            sb.Append(name)
                .Append(',')
                .Append(row.BestScore.ToString(System.Globalization.CultureInfo.InvariantCulture))
                .AppendLine();
        }

        return File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv", $"leaderboard-{gameId}.csv");
    }

    private async Task<IEnumerable<LeaderboardRowDto>> GetRowsAsync(Guid gameId, int top)
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
            .OrderByDescending(x => x.Best)
            .Take(Math.Clamp(top, 1, 200))
            .ToListAsync();

        var scoreEntries = await _db.Scores
            .Where(s => s.GameId == gameId && s.Verified)
            .Select(s => new ScoreEntry(s.MatchSessionId, s.UserId, s.Value))
            .ToListAsync();

        var sessionStatsLookup = BuildSessionStatsFromScores(scoreEntries);

        var totalPlayers = rows.Count == 0
            ? 0
            : await _db.Scores
                .Where(s => s.GameId == gameId && s.Verified)
                .Select(s => s.UserId)
                .Distinct()
                .CountAsync();

        if (rows.Count == 0)
        {
            var playerRows = await _db.SessionPlayers
                .Join(_db.MatchSessions.Where(s => s.GameId == gameId),
                    player => player.SessionId,
                    session => session.Id,
                    (player, session) => new PlayerEntry(player.UserId, player.Role, player.SessionId))
                .ToListAsync();

            if (playerRows.Count > 0)
            {
                var hasResults = playerRows.Any(r => string.Equals(r.Role, "winner", StringComparison.OrdinalIgnoreCase)
                                                     || string.Equals(r.Role, "loser", StringComparison.OrdinalIgnoreCase));
                if (!hasResults)
                {
                    return Enumerable.Empty<LeaderboardRowDto>();
                }

                totalPlayers = playerRows.Select(r => r.UserId).Distinct().Count();
                rows = playerRows
                    .Where(r => string.Equals(r.Role, "winner", StringComparison.OrdinalIgnoreCase)
                                || string.Equals(r.Role, "loser", StringComparison.OrdinalIgnoreCase))
                    .GroupBy(r => r.UserId)
                    .Select(g => new
                    {
                        UserId = g.Key,
                        Best = g.Count(r => string.Equals(r.Role, "winner", StringComparison.OrdinalIgnoreCase))
                    })
                    .Select(x => new { x.UserId, Best = (double)x.Best, Matches = x.Best })
                    .OrderByDescending(x => x.Best)
                    .Take(Math.Clamp(top, 1, 200))
                    .ToList();

                if (sessionStatsLookup.Count == 0)
                {
                    sessionStatsLookup = BuildSessionStatsFromPlayers(playerRows);
                }
            }
        }

        var users = await _db.Users
            .Where(u => rows.Select(r => r.UserId).Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
            .ToListAsync();

        var nameLookup = users.ToDictionary(
            u => u.Id,
            u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id));

        var ordered = rows
            .OrderByDescending(r => r.Best)
            .ToList();

        return ordered.Select((r, index) =>
        {
            var position = index + 1;
            sessionStatsLookup.TryGetValue(r.UserId, out var sessionStat);
            var matches = Math.Max(r.Matches, sessionStat?.Played ?? 0);
            var xp = RankCalculator.CalculateGameExperience(matches, position, Math.Max(1, totalPlayers));
            return new LeaderboardRowDto(
                nameLookup.GetValueOrDefault(r.UserId, r.UserId.ToUpperInvariant()),
                r.Best,
                matches,
                position,
                totalPlayers,
                xp,
                sessionStat?.Wins ?? 0,
                sessionStat?.Losses ?? 0,
                r.Best);
        });
    }

    private sealed record SessionStat(string UserId, string Role, Guid SessionId);

    private sealed record SessionAggregate(int Played, int Wins, int Losses);
    private sealed record ScoreEntry(Guid MatchSessionId, string UserId, double Value);
    private sealed record PlayerEntry(string UserId, string Role, Guid SessionId);

    private static Dictionary<string, SessionAggregate> BuildSessionStatsFromScores(IEnumerable<ScoreEntry> scoreEntries)
    {
        var stats = new Dictionary<string, SessionAggregate>(StringComparer.Ordinal);
        var bySession = scoreEntries
            .GroupBy(entry => entry.MatchSessionId);

        foreach (var session in bySession)
        {
            var entries = session
                .Select(entry => new { entry.UserId, entry.Value })
                .ToList();
            if (entries.Count == 0)
            {
                continue;
            }
            var topScore = entries.Max(entry => entry.Value);
            foreach (var entry in entries)
            {
                var isWinner = entry.Value.Equals(topScore);
                if (!stats.TryGetValue(entry.UserId, out var aggregate))
                {
                    aggregate = new SessionAggregate(0, 0, 0);
                }
                aggregate = aggregate with
                {
                    Played = aggregate.Played + 1,
                    Wins = aggregate.Wins + (isWinner ? 1 : 0),
                    Losses = aggregate.Losses + (isWinner ? 0 : 1)
                };
                stats[entry.UserId] = aggregate;
            }
        }

        return stats;
    }

    private static Dictionary<string, SessionAggregate> BuildSessionStatsFromPlayers(IEnumerable<PlayerEntry> playerRows)
    {
        return playerRows
            .GroupBy(entry => entry.UserId)
            .ToDictionary(
                group => group.Key,
                group =>
                {
                    var played = group.Select(entry => entry.SessionId).Distinct().Count();
                    var wins = group.Count(entry => string.Equals(entry.Role, "winner", StringComparison.OrdinalIgnoreCase));
                    var losses = group.Count(entry => string.Equals(entry.Role, "loser", StringComparison.OrdinalIgnoreCase));
                    return new SessionAggregate(played, wins, losses);
                },
                StringComparer.Ordinal);
    }

    private static string QuoteCsv(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "\"\"";
        }

        var needsQuotes = value.Contains('"') || value.Contains(',') || value.Contains('\n') || value.Contains('\r');
        var escaped = value.Replace("\"", "\"\"");
        return needsQuotes ? $"\"{escaped}\"" : escaped;
    }
}
