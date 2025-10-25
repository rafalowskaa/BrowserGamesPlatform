using System.Linq;
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
            .Select(u => new { u.Id, u.Email, u.DisplayName, u.CreatedAtUtc, u.IsBlocked })
            .ToListAsync();
        return Ok(users);
    }

    [HttpGet("games")]
    public async Task<ActionResult<object>> Games()
    {
        var games = await _db.Games
            .OrderByDescending(g => g.CreatedAtUtc)
            .Select(g => new { g.Id, g.Title, g.Slug, g.ApprovalStatus, g.CreatedAtUtc })
            .ToListAsync();
        return Ok(games);
    }

    [HttpGet("reports")]
    public async Task<ActionResult<object>> Reports()
    {
        var list = await _db.Reports
            .OrderByDescending(r => r.CreatedAtUtc)
            .Select(r => new { r.Id, r.ReporterUserId, r.TargetUserId, r.Category, r.Status, r.CreatedAtUtc, r.Description })
            .ToListAsync();
        return Ok(list);
    }

    [HttpPost("reports/{id:guid}/status")]
    public async Task<IActionResult> UpdateReportStatus(Guid id, [FromBody] Bgp.Application.Dtos.UpdateReportStatusDto dto)
    {
        var r = await _db.Reports.FindAsync(id);
        if (r is null) return NotFound();
        r.Status = dto.Status;
        await _db.SaveChangesAsync();
        return Ok();
    }
}
