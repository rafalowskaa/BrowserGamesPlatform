using System.Security.Claims;
using Bgp.Infrastructure.Persistence;
using Bgp.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games/{gameId:guid}/reviews")]
public class ReviewsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ReviewsController(AppDbContext db) => _db = db;

    public class ReviewDto
    {
        [Range(1, 5)] public int Stars { get; set; }
        [MaxLength(2000)] public string? Comment { get; set; }
    }

    [HttpGet]
    public async Task<ActionResult<object>> Get(Guid gameId)
    {
        var game = await _db.Games.Include(g => g.Reviews).FirstOrDefaultAsync(g => g.Id == gameId);
        if (game is null) return NotFound();

        var items = game.Reviews.OrderByDescending(r => r.CreatedAtUtc)
            .Select(r => new { r.Stars, r.Comment, r.CreatedAtUtc });

        return Ok(new
        {
            Avg = game.Reviews.Any() ? game.Reviews.Average(r => r.Stars) : 0,
            Count = game.Reviews.Count,
            Items = items
        });
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult> Post(Guid gameId, [FromBody] ReviewDto dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        if (!await _db.Games.AnyAsync(g => g.Id == gameId)) return NotFound();

        var existing = await _db.GameReviews.FirstOrDefaultAsync(r => r.GameId == gameId && r.UserId == userId);
        if (existing is null)
        {
            var r = new GameReview { GameId = gameId, UserId = userId, Stars = dto.Stars, Comment = dto.Comment };
            _db.GameReviews.Add(r);
        }
        else
        {
            existing.Stars = dto.Stars;
            existing.Comment = dto.Comment;
        }

        await _db.SaveChangesAsync();
        return Ok();
    }
}
