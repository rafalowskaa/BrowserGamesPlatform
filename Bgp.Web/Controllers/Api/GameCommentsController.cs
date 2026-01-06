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

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games/{gameId:guid}/comments")]
public class GameCommentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IStringLocalizer<SharedResource> _localizer;

    private static readonly TimeSpan CommentCooldown = TimeSpan.FromSeconds(30);

    public GameCommentsController(AppDbContext db, IStringLocalizer<SharedResource> localizer)
    {
        _db = db;
        _localizer = localizer;
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

        var query = _db.GameReviews
            .AsNoTracking()
            .Where(r => r.GameId == gameId && !string.IsNullOrWhiteSpace(r.Comment))
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
            author = userLookup.TryGetValue(item.UserId, out var name) ? name : DisplayNameFormatter.Format(null, null, null, item.UserId)
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

        return Created(string.Empty, new
        {
            id = existingRating.Id,
            text = HtmlEncoder.Default.Encode(existingRating.Comment ?? string.Empty),
            created_at = existingRating.CreatedAtUtc
        });
    }
}