using System.Security.Claims;
using Bgp.Application.Dtos;
using Bgp.Domain.Entities;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/reports")]
[Authorize]
public class ReportsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ReportsController(AppDbContext db) => _db = db;

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReportDto dto)
    {
        var uid = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(uid)) return Unauthorized();

        var r = new Report
        {
            ReporterUserId = uid,
            TargetUserId = dto.TargetUserId,
            Category = dto.Category,
            Description = dto.Description
        };
        _db.Reports.Add(r);
        await _db.SaveChangesAsync();
        return Ok(new { r.Id });
    }
}
