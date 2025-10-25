using System.Linq;
using System.Security.Claims;
using Bgp.Application.Dtos;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/friends")]
[Authorize]
public class FriendsController : ControllerBase
{
    private readonly AppDbContext _db;
    public FriendsController(AppDbContext db) => _db = db;

    private string? UserId => User.FindFirstValue(ClaimTypes.NameIdentifier);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<FriendDto>>> Get()
    {
        var uid = UserId!;

        var accepted = await _db.Friendships
            .Where(f => (f.RequesterId == uid || f.AddresseeId == uid) && f.Status == FriendshipStatus.Accepted)
            .Select(f => new { f.RequesterId, f.AddresseeId })
            .ToListAsync();

        var friendIds = accepted.Select(a => a.RequesterId == uid ? a.AddresseeId : a.RequesterId).Distinct().ToList();

        var users = await _db.Users.Where(u => friendIds.Contains(u.Id))
            .Select(u => new FriendDto(u.Id, u.DisplayName ?? u.Email ?? u.UserName ?? u.Id, FriendshipStatus.Accepted, false))
            .ToListAsync();

        var outgoing = await _db.Friendships
            .Where(f => f.RequesterId == uid && f.Status == FriendshipStatus.Pending)
            .Select(f => f.AddresseeId)
            .ToListAsync();

        var outgoingUsers = await _db.Users.Where(u => outgoing.Contains(u.Id))
            .Select(u => new FriendDto(u.Id, u.DisplayName ?? u.Email ?? u.UserName ?? u.Id, FriendshipStatus.Pending, true))
            .ToListAsync();

        var incoming = await _db.Friendships
            .Where(f => f.AddresseeId == uid && f.Status == FriendshipStatus.Pending)
            .Select(f => f.RequesterId)
            .ToListAsync();

        var incomingUsers = await _db.Users.Where(u => incoming.Contains(u.Id))
            .Select(u => new FriendDto(u.Id, u.DisplayName ?? u.Email ?? u.UserName ?? u.Id, FriendshipStatus.Pending, false))
            .ToListAsync();

        return Ok(users.Concat(outgoingUsers).Concat(incomingUsers));
    }

    [HttpGet("search")]
    public async Task<ActionResult<IEnumerable<object>>> Search([FromQuery] string q)
    {
        var uid = UserId!;
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
        {
            return Ok(Array.Empty<object>());
        }

        var term = q.Trim();

        var excludedIds = await _db.Friendships
            .Where(f => f.RequesterId == uid || f.AddresseeId == uid)
            .Select(f => f.RequesterId == uid ? f.AddresseeId : f.RequesterId)
            .ToListAsync();
        excludedIds.Add(uid);

        var results = await _db.Users
            .AsNoTracking()
            .Where(u => !u.IsBlocked)
            .Where(u => !excludedIds.Contains(u.Id))
            .Where(u => EF.Functions.Like(u.DisplayName ?? u.Email ?? u.UserName ?? string.Empty, $"%{term}%"))
            .OrderBy(u => u.DisplayName ?? u.Email ?? u.UserName ?? u.Id)
            .Take(12)
            .Select(u => new
            {
                u.Id,
                Name = u.DisplayName ?? u.Email ?? u.UserName ?? u.Id,
                u.AvatarUrl
            })
            .ToListAsync();

        return Ok(results);
    }

    [HttpPost("send")]
    public async Task<ActionResult> Send([FromBody] FriendRequestDto dto)
    {
        var uid = UserId!;
        if (uid == dto.TargetUserId) return BadRequest("Nie można dodać siebie.");

        var exists = await _db.Friendships.AnyAsync(f =>
            (f.RequesterId == uid && f.AddresseeId == dto.TargetUserId) ||
            (f.RequesterId == dto.TargetUserId && f.AddresseeId == uid));
        if (exists) return Conflict("Zaproszenie już istnieje lub jesteście znajomymi.");

        _db.Friendships.Add(new Friendship
        {
            RequesterId = uid,
            AddresseeId = dto.TargetUserId,
            Status = FriendshipStatus.Pending
        });
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpPost("accept/{requesterId}")]
    public async Task<ActionResult> Accept(string requesterId)
    {
        var uid = UserId!;
        var fr = await _db.Friendships.FirstOrDefaultAsync(f => f.RequesterId == requesterId && f.AddresseeId == uid);
        if (fr is null) return NotFound();
        fr.Status = FriendshipStatus.Accepted;
        fr.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("{userId}")]
    public async Task<ActionResult> Remove(string userId)
    {
        var uid = UserId!;
        var fr = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == uid && f.AddresseeId == userId) ||
            (f.RequesterId == userId && f.AddresseeId == uid));
        if (fr is null) return NotFound();
        _db.Friendships.Remove(fr);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("block/{userId}")]
    public async Task<ActionResult> Block(string userId)
    {
        var uid = UserId!;
        var fr = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == uid && f.AddresseeId == userId) ||
            (f.RequesterId == userId && f.AddresseeId == uid));

        if (fr is null)
        {
            fr = new Friendship { RequesterId = uid, AddresseeId = userId };
            _db.Friendships.Add(fr);
        }

        fr.Status = FriendshipStatus.Blocked;
        fr.BlockedByUserId = uid;
        fr.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpPost("unblock/{userId}")]
    public async Task<ActionResult> Unblock(string userId)
    {
        var uid = UserId!;
        var fr = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == uid && f.AddresseeId == userId) ||
            (f.RequesterId == userId && f.AddresseeId == uid));

        if (fr is null) return NotFound();

        _db.Friendships.Remove(fr);
        await _db.SaveChangesAsync();
        return Ok();
    }
}
