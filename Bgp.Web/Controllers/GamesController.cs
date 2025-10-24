using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers;

public class GamesController : Controller
{
    private readonly AppDbContext _db;
    public GamesController(AppDbContext db) => _db = db;

    public async Task<IActionResult> Index()
    {
        var list = await _db.Games
            .AsNoTracking()
            .OrderByDescending(g => g.CreatedAtUtc)
            .Select(g => new
            {
                g.Id,
                g.Title,
                g.Slug,
                g.CoverImagePath,
                Avg = g.Reviews.Any() ? g.Reviews.Average(r => r.Stars) : 0.0
            })
            .ToListAsync();

        return View(list);
    }

    public async Task<IActionResult> Details(string slug)
    {
        var g = await _db.Games
            .Include(x => x.Versions)
            .FirstOrDefaultAsync(x => x.Slug == slug);

        if (g is null) return NotFound();

        var latest = g.Versions.OrderByDescending(v => v.PublishedAtUtc).FirstOrDefault();
        ViewBag.PlayUrl = latest is null ? null : $"{latest.ContentPath.TrimEnd('/')}/index.html";
        return View(g);
    }
}
