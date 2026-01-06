using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Helpers;
using Bgp.Web.Resources;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;
using Bgp.Domain.Enums;
using Bgp.Web.Services;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games/{gameId:guid}/comments")]
public class GameCommentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IStringLocalizer<SharedResource> _localizer;
    private readonly IActivityLogger _logger;

    private static readonly TimeSpan CommentCooldown = TimeSpan.FromSeconds(30);

    public GameCommentsController(AppDbContext db, IStringLocalizer<SharedResource> localizer, IActivityLogger logger)
    {
        _db = db;
        _localizer = localizer;
        _logger = logger;
    }

    public class CommentRequest
    {
        [Required, MaxLength(2000)]
        public string Text { get; set; } = string.Empty;
    }

    [HttpGet]
    public async Task<ActionResult<object>> Get(Guid gameId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        if (page < 1) page = 1;
        pageSize = Math.Clamp(pageSize, 5, 50);

        var game = await _db.Games.FirstOrDefaultAsync(g => g.Id == gameId);
        if (game is null)
        {
            return NotFound();
        }

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);

        var query = _db.GameReviews
            .AsNoTracking()
            .Where(r => r.GameId == gameId && !string.IsNullOrWhiteSpace(r.Comment))
            .Include(r => r.Reactions)
            .OrderByDescending(r => r.CreatedAtUtc);

        var total = await query.CountAsync();
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var userIds = items.Select(i => i.UserId).Distinct().ToList();
        var userLookup = userIds.Count == 0
            ? new Dictionary<string, string>()
            : await _db.Users
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
                .ToDictionaryAsync(u => u.Id, u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id));

        var payload = items.Select(item => new
        {
            id = item.Id,
            text = HtmlEncoder.Default.Encode(item.Comment ?? string.Empty),
            created_at = item.CreatedAtUtc,
            author = userLookup.TryGetValue(item.UserId, out var name) ? name : DisplayNameFormatter.Format(null, null, null, item.UserId),
            likes = item.Reactions.Count(r => r.Reaction == CommentReactionType.Like),
            dislikes = item.Reactions.Count(r => r.Reaction == CommentReactionType.Dislike),
            user_vote = string.IsNullOrEmpty(userId)
                ? null
                : item.Reactions.FirstOrDefault(r => r.UserId == userId)?.Reaction switch
                {
                    CommentReactionType.Like => "like",
                    CommentReactionType.Dislike => "dislike",
                    _ => null
                }
        });

        return Ok(new
        {
            items = payload,
            page,
            pageSize,
            total
        });
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult> Post(Guid gameId, [FromBody] CommentRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest(new { code = "empty_comment", message = _localizer["Games_Details_Comments_Empty"].Value });
        }

        if (!await _db.Games.AnyAsync(g => g.Id == gameId))
        {
            return NotFound();
        }

        var now = DateTime.UtcNow;
        var last = await _db.GameReviews
            .Where(r => r.GameId == gameId && r.UserId == userId)
            .OrderByDescending(r => r.CreatedAtUtc)
            .Select(r => r.CreatedAtUtc)
            .FirstOrDefaultAsync();

        if (last != default && now - last < CommentCooldown)
        {
            return StatusCode(429, new { code = "comment_rate_limited", message = _localizer["Games_Details_Comments_Error"].Value });
        }

        var existingRating = await _db.GameReviews.FirstOrDefaultAsync(r => r.GameId == gameId && r.UserId == userId);
        if (existingRating is null)
        {
            existingRating = new Domain.Entities.GameReview
            {
                GameId = gameId,
                UserId = userId,
                Stars = 5,
                CreatedAtUtc = now
            };
            _db.GameReviews.Add(existingRating);
        }

        existingRating.Comment = request.Text.Trim();
        existingRating.CreatedAtUtc = now;

        await _db.SaveChangesAsync();
        await _logger.LogAsync(ActivityLogType.CommentAdded, userId, log =>
        {
            log.GameId = gameId;
            log.CommentId = existingRating.Id;
            log.Message = request.Text.Trim();
        });

        return Created(string.Empty, new
        {
            id = existingRating.Id,
            text = HtmlEncoder.Default.Encode(existingRating.Comment ?? string.Empty),
            created_at = existingRating.CreatedAtUtc
        });
    }
    public class ReactionRequest
    {
        [Required]
        public string Value { get; set; } = string.Empty;
    }

    [Authorize]
    [HttpPost("{commentId:guid}/reactions")]
    public async Task<ActionResult> React(Guid gameId, Guid commentId, [FromBody] ReactionRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var review = await _db.GameReviews
            .Include(r => r.Reactions)
            .FirstOrDefaultAsync(r => r.Id == commentId && r.GameId == gameId && !string.IsNullOrEmpty(r.Comment));

        if (review is null)
        {
            return NotFound();
        }

        var value = request.Value?.ToLowerInvariant();
        var reaction = value switch
        {
            "like" => CommentReactionType.Like,
            "dislike" => CommentReactionType.Dislike,
            _ => CommentReactionType.None
        };

        if (reaction == CommentReactionType.None)
        {
            return BadRequest(new { code = "invalid_reaction" });
        }

        var existing = review.Reactions.FirstOrDefault(r => r.UserId == userId);
        if (existing is null)
        {
            existing = new Domain.Entities.GameCommentReaction
            {
                ReviewId = review.Id,
                UserId = userId,
                Reaction = reaction,
                CreatedAtUtc = DateTime.UtcNow
            };
            review.Reactions.Add(existing);
            _db.GameCommentReactions.Add(existing);
        }
        else
        {
            existing.Reaction = reaction;
        }

        await _db.SaveChangesAsync();

        await _logger.LogAsync(
            reaction == CommentReactionType.Like ? ActivityLogType.CommentLiked : ActivityLogType.CommentDisliked,
            userId,
            log =>
            {
                log.GameId = gameId;
                log.CommentId = commentId;
            });

        var likes = review.Reactions.Count(r => r.Reaction == CommentReactionType.Like);
        var dislikes = review.Reactions.Count(r => r.Reaction == CommentReactionType.Dislike);

        return Ok(new
        {
            likes,
            dislikes,
            userVote = value
        });
    }

    [Authorize(Roles = "Admin,Moderator")]
    [HttpDelete("{commentId:guid}")]
    public async Task<ActionResult> Delete(Guid gameId, Guid commentId)
    {
        var review = await _db.GameReviews
            .Include(r => r.Reactions)
            .FirstOrDefaultAsync(r => r.Id == commentId && r.GameId == gameId);
        if (review is null)
        {
            return NotFound();
        }

        _db.GameCommentReactions.RemoveRange(review.Reactions);
        review.Comment = null;
        await _db.SaveChangesAsync();

        var actor = User.FindFirstValue(ClaimTypes.NameIdentifier);
        await _logger.LogAsync(ActivityLogType.CommentDeleted, actor, log =>
        {
            log.GameId = gameId;
            log.CommentId = commentId;
        });

        return NoContent();
    }
}