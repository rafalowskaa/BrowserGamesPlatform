using System.Security.Claims;
using System.ComponentModel.DataAnnotations;
using Bgp.Infrastructure.Persistence;
using Bgp.Domain.Enums;
using Bgp.Web.Helpers;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games/{gameId:guid}/ratings")]
public class GameRatingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IActivityLogger _logger;

    public GameRatingsController(AppDbContext db, IActivityLogger logger)
    {
        _db = db;
        _logger = logger;
    }

    public class RatingDto
    {
        [Range(1, 5)]
        public int Value { get; set; }
    }

    [HttpGet]
    public async Task<ActionResult<object>> Get(Guid gameId)
    {
        var game = await _db.Games
            .Include(g => g.Reviews)
            .FirstOrDefaultAsync(g => g.Id == gameId);

        if (game is null)
        {
            return NotFound();
        }

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var reviews = game.Reviews.Where(r => r.IsRating && r.Stars > 0).ToList();
        var avg = reviews.Count > 0 ? reviews.Average(r => r.Stars) : 0;
        var distribution = Enumerable.Range(1, 5)
            .ToDictionary(v => v, v => reviews.Count(r => r.Stars == v));
        int? userRating = null;
        if (!string.IsNullOrEmpty(userId))
        {
            userRating = reviews.FirstOrDefault(r => r.UserId == userId)?.Stars;
        }

        return Ok(new
        {
            avg,
            count = reviews.Count,
            distribution,
            user_rating = userRating
        });
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult> Post(Guid gameId, [FromBody] RatingDto dto)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        if (!await _db.Games.AnyAsync(g => g.Id == gameId))
        {
            return NotFound();
        }

        if (dto.Value is < 1 or > 5)
        {
            return BadRequest(new { code = "invalid_rating", message = "Rating must be between 1 and 5." });
        }

        var existing = await _db.GameReviews.FirstOrDefaultAsync(r => r.GameId == gameId && r.UserId == userId && r.IsRating);
        if (existing is null)
        {
            _db.GameReviews.Add(new Domain.Entities.GameReview
            {
                GameId = gameId,
                UserId = userId,
                Stars = dto.Value,
                Comment = null,
                CreatedAtUtc = DateTime.UtcNow,
                IsRating = true
            });
        }
        else
        {
            return Conflict(new { code = "rating_locked", message = "You have already rated this game." });
        }

        await _db.SaveChangesAsync();
        await _logger.LogAsync(ActivityLogType.RatingSubmitted, userId, log =>
        {
            log.GameId = gameId;
            log.Rating = dto.Value;
        });

        await _logger.LogAsync(ActivityLogType.ExperienceGained, userId, log =>
        {
            log.GameId = gameId;
            log.TargetUserId = userId;
            log.Message = ExperienceLogFormatter.BuildMessage(RankCalculator.RatingExperience, "rating", reference: $"{gameId:N}:{userId}");
        });

        return Ok(new { value = dto.Value });
    }
}