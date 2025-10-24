using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    public AdminController(AppDbContext db) => _db = db;

    [HttpGet("users")]
    public async Task<ActionResult<object>> Users()
    {
        var users = await _db.Users
            .OrderByDescending(u => u.CreatedAtUtc)
            .Select(u => new { u.Id, u.Email, u.DisplayName, u.CreatedAtUtc })
            .ToListAsync();
        return Ok(users);
    }

    [HttpGet("games")]
    public async Task<ActionResult<object>> Games()
    {
        var games = await _db.Games
            .OrderByDescending(g => g.CreatedAtUtc)
            .Select(g => new { g.Id, g.Title, g.Slug, g.IsPublished, g.CreatedAtUtc })
            .ToListAsync();
        return Ok(games);
    }
}
