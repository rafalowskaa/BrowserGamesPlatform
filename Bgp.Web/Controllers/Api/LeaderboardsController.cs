using Bgp.Application.Dtos;
using Bgp.Domain.Enums;
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
    public async Task<ActionResult> Get(Guid gameId, [FromQuery] int top = 20, [FromQuery] string? mode = null, [FromQuery] int? limit = null)
    {
        if (!string.IsNullOrWhiteSpace(mode))
        {
            if (!TryParseMode(mode, out var parsedMode))
            {
                return BadRequest("Nieprawidłowy tryb gry.");
            }

            var externalRows = await GetExternalRowsAsync(gameId, parsedMode, limit ?? 100);
            return Ok(externalRows);
        }

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
            .Select(row => new LeaderboardSeed(row.UserId, row.Best, row.Matches))
            .ToListAsync();

        var scoreEntries = await _db.Scores
            .Where(s => s.GameId == gameId && s.Verified)
            .Select(s => new ScoreEntry(s.MatchSessionId, s.UserId, s.Value))
            .ToListAsync();

        var playerRows = await _db.SessionPlayers
            .Join(_db.MatchSessions.Where(s => s.GameId == gameId),
                player => player.SessionId,
                session => session.Id,
                (player, session) => new PlayerEntry(player.UserId, player.Role, player.SessionId))
            .ToListAsync();

        var hasOutcomeRoles = playerRows.Any(r => string.Equals(r.Role, "winner", StringComparison.OrdinalIgnoreCase)
                                                  || string.Equals(r.Role, "loser", StringComparison.OrdinalIgnoreCase));
        var sessionStatsLookup = playerRows.Count == 0
            ? BuildSessionStatsFromScores(scoreEntries)
            : hasOutcomeRoles
                ? BuildSessionStatsFromPlayers(playerRows)
                : BuildSessionStatsFromScores(scoreEntries);

        var totalPlayers = sessionStatsLookup.Count > 0
            ? sessionStatsLookup.Count
            : rows.Count == 0
                ? 0
                : await _db.Scores
                    .Where(s => s.GameId == gameId && s.Verified)
                    .Select(s => s.UserId)
                    .Distinct()
                    .CountAsync();

        if (rows.Count == 0)
        {
            if (playerRows.Count > 0)
            {
                totalPlayers = playerRows.Select(r => r.UserId).Distinct().Count();
                if (hasOutcomeRoles)
                {
                    rows = playerRows
                        .Where(r => string.Equals(r.Role, "winner", StringComparison.OrdinalIgnoreCase)
                                    || string.Equals(r.Role, "loser", StringComparison.OrdinalIgnoreCase))
                        .GroupBy(r => r.UserId)
                        .Select(g => new
                        {
                            UserId = g.Key,
                            Best = g.Count(r => string.Equals(r.Role, "winner", StringComparison.OrdinalIgnoreCase))
                        })
                         .Select(x => new LeaderboardSeed(x.UserId, x.Best, x.Best))
                        .OrderByDescending(x => x.Best)
                        .Take(Math.Clamp(top, 1, 200))
                        .ToList();
                }
                else
                {
                    rows = playerRows
                        .GroupBy(r => r.UserId)
                        .Select(g => new
                        {
                            UserId = g.Key,
                            Matches = g.Select(r => r.SessionId).Distinct().Count()
                        })
                        .Select(x => new LeaderboardSeed(x.UserId, x.Matches, x.Matches))
                        .OrderByDescending(x => x.Best)
                        .Take(Math.Clamp(top, 1, 200))
                        .ToList();
                }

                if (sessionStatsLookup.Count == 0)
                {
                    sessionStatsLookup = BuildSessionStatsFromPlayers(playerRows);
                }
            }
        }

        if (sessionStatsLookup.Count > 0)
        {
            var existingUsers = new HashSet<string>(rows.Select(r => r.UserId), StringComparer.Ordinal);
            foreach (var entry in sessionStatsLookup)
            {
                if (!existingUsers.Add(entry.Key))
                {
                    continue;
                }

                rows.Add(new LeaderboardSeed(entry.Key, 0d, entry.Value.Played));
            }
        }

        if (rows.Count > totalPlayers)
        {
            totalPlayers = rows.Select(r => r.UserId).Distinct(StringComparer.Ordinal).Count();
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
            .ThenByDescending(r => r.Matches)
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

    private async Task<IEnumerable<object>> GetExternalRowsAsync(Guid gameId, GameMode mode, int limit)
    {
        var sessions = await _db.MatchSessions
            .Where(s => s.GameId == gameId && s.Mode == mode)
            .Select(s => s.Id)
            .ToListAsync();

        if (sessions.Count == 0)
        {
            return Enumerable.Empty<object>();
        }

        var players = await _db.SessionPlayers
            .Where(p => sessions.Contains(p.SessionId))
            .Select(p => new { p.SessionId, p.UserId })
            .ToListAsync();

        var scores = await _db.Scores
            .Where(s => s.GameId == gameId && s.Mode == mode && s.Verified && sessions.Contains(s.MatchSessionId))
            .Select(s => new { s.MatchSessionId, s.UserId, s.Value })
            .ToListAsync();

        var stats = new Dictionary<string, (int wins, int losses, int draws, int games)>(StringComparer.Ordinal);
        foreach (var sessionGroup in players.GroupBy(p => p.SessionId))
        {
            var sessionPlayers = sessionGroup.Select(p => p.UserId).Distinct(StringComparer.Ordinal).ToList();
            var sessionScores = scores.Where(s => s.MatchSessionId == sessionGroup.Key).ToList();
            if (sessionScores.Count == 0)
            {
                continue;
            }

            var topScore = sessionScores.Max(s => s.Value);
            var isDraw = sessionScores.All(s => s.Value.Equals(topScore));

            foreach (var playerId in sessionPlayers)
            {
                var entry = stats.TryGetValue(playerId, out var current)
                   ? current
                   : (wins: 0, losses: 0, draws: 0, games: 0);
                entry.games += 1;

                var playerScore = sessionScores.FirstOrDefault(s => s.UserId == playerId);
                if (playerScore is null)
                {
                    entry.losses += 1;
                }
                else if (isDraw)
                {
                    entry.draws += 1;
                }
                else if (playerScore.Value.Equals(topScore))
                {
                    entry.wins += 1;
                }
                else
                {
                    entry.losses += 1;
                }

                stats[playerId] = entry;
            }
        }

        if (stats.Count == 0)
        {
            return Enumerable.Empty<object>();
        }

        var userIds = stats.Keys.ToList();
        var users = await _db.Users
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
            .ToListAsync();

        var nameLookup = users.ToDictionary(
            u => u.Id,
            u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id),
            StringComparer.Ordinal);

        return stats
            .Select(entry => new
            {
                userId = entry.Key,
                userName = nameLookup.GetValueOrDefault(entry.Key, entry.Key.ToUpperInvariant()),
                nick = nameLookup.GetValueOrDefault(entry.Key, entry.Key.ToUpperInvariant()),
                wins = entry.Value.wins,
                losses = entry.Value.losses,
                draws = entry.Value.draws,
                games = entry.Value.games,
                totalMatches = entry.Value.games,
                points = (entry.Value.wins * 3) + entry.Value.draws
            })
            .OrderByDescending(r => r.points)
            .ThenByDescending(r => r.wins)
            .Take(Math.Clamp(limit, 1, 200))
            .ToList();
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

    private sealed record SessionStat(string UserId, string Role, Guid SessionId);

    private sealed record SessionAggregate(int Played, int Wins, int Losses);
    private sealed record ScoreEntry(Guid MatchSessionId, string UserId, double Value);
    private sealed record PlayerEntry(string UserId, string Role, Guid SessionId);
    private sealed record LeaderboardSeed(string UserId, double Best, int Matches);

    private static Dictionary<string, SessionAggregate> BuildSessionStatsFromScores(IEnumerable<ScoreEntry> scoreEntries)
    {
        var stats = new Dictionary<string, SessionAggregate>(StringComparer.Ordinal);
        foreach (var session in scoreEntries.GroupBy(entry => entry.MatchSessionId))
        {
            var entries = session.ToList();
            if (entries.Count < 2)
            {
                continue;
            }
            var topScore = entries.Max(entry => entry.Value);
            var isDraw = entries.All(entry => entry.Value.Equals(topScore));
            foreach (var entry in entries)
            {
                
                if (!stats.TryGetValue(entry.UserId, out var aggregate))
                {
                    aggregate = new SessionAggregate(0, 0, 0);
                }
                aggregate = aggregate with
                {
                    Played = aggregate.Played + 1,
                    Wins = aggregate.Wins + (!isDraw && entry.Value.Equals(topScore) ? 1 : 0),
                    Losses = aggregate.Losses + (!isDraw && !entry.Value.Equals(topScore) ? 1 : 0)
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
