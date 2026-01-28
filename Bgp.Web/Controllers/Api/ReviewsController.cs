using System.Collections.Generic;
using System.Security.Claims;
using System.Linq;
using Bgp.Infrastructure.Persistence;
using Bgp.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using Bgp.Web.Helpers;

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

        var ratingReviews = game.Reviews.Where(r => r.IsRating && r.Stars > 0).ToList();
        var userIds = ratingReviews.Select(r => r.UserId).Distinct().ToList();
        var userLookup = userIds.Count == 0
            ? new Dictionary<string, string>()
            : await _db.Users
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
                .ToDictionaryAsync(u => u.Id, u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id));

        string ResolveAuthor(string uid)
        {
            return userLookup.TryGetValue(uid, out var name)
                ? name
                : DisplayNameFormatter.Format(null, null, null, uid);
        }

        var items = ratingReviews.OrderByDescending(r => r.CreatedAtUtc)
            .Select(r => new { r.Stars, r.Comment, r.CreatedAtUtc, Author = ResolveAuthor(r.UserId) });

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var userStars = string.IsNullOrEmpty(userId)
            ? (int?)null
            : ratingReviews.FirstOrDefault(r => r.UserId == userId)?.Stars;

        return Ok(new
        {
            Avg = ratingReviews.Any() ? ratingReviews.Average(r => r.Stars) : 0,
            Count = ratingReviews.Count,
            Items = items,
            UserStars = userStars
        });
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult> Post(Guid gameId, [FromBody] ReviewDto dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId)) return Unauthorized();
        if (!await _db.Games.AnyAsync(g => g.Id == gameId)) return NotFound();

        var existing = await _db.GameReviews.FirstOrDefaultAsync(r => r.GameId == gameId && r.UserId == userId && r.IsRating);
        if (existing is null)
        {
            var r = new GameReview { GameId = gameId, UserId = userId, Stars = dto.Stars, Comment = dto.Comment, IsRating = true };
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
