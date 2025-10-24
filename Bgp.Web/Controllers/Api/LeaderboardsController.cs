using Bgp.Application.Dtos;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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
        // najlepszy wynik per użytkownik
        var rows = await _db.Scores
            .Where(s => s.GameId == gameId && s.Verified)
            .GroupBy(s => s.UserId)
            .Select(g => new { UserId = g.Key, Best = g.Max(s => s.Value) })
            .OrderByDescending(x => x.Best)
            .Take(Math.Clamp(top, 1, 200))
            .ToListAsync();

        // mapowanie UserId -> DisplayName/Email
        var users = await _db.Users
            .Where(u => rows.Select(r => r.UserId).Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName ?? u.Email ?? u.UserName ?? u.Id);

        var result = rows.Select(r => new LeaderboardRowDto(users.GetValueOrDefault(r.UserId, r.UserId), r.Best));
        return Ok(result);
    }
}
