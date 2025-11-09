using Bgp.Application.Dtos;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SixLabors.ImageSharp.ColorSpaces;
using System.Text;
using static System.Net.Mime.MediaTypeNames;

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
            .Select(g => new { UserId = g.Key, Best = g.Max(s => s.Value) })
            .OrderByDescending(x => x.Best)
            .Take(Math.Clamp(top, 1, 200))
            .ToListAsync();

        var users = await _db.Users
            .Where(u => rows.Select(r => r.UserId).Contains(u.Id))
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
            .ToListAsync();

        var nameLookup = users.ToDictionary(
            u => u.Id,
            u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id));

        return rows.Select(r => new LeaderboardRowDto(nameLookup.GetValueOrDefault(r.UserId, r.UserId.ToUpperInvariant()), r.Best));
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
