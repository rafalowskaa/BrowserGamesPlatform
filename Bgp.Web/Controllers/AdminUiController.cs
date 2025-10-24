using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers;

[Authorize(Roles = "Admin")]
public class AdminUiController : Controller
{
    private readonly AppDbContext _db;
    public AdminUiController(AppDbContext db) => _db = db;

    public async Task<IActionResult> Reports()
    {
        var list = await _db.Reports
            .OrderByDescending(r => r.CreatedAtUtc)
            .ToListAsync();
        return View(list);
    }
}
