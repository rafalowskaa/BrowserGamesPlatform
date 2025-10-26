using System.Security.Claims;
using Bgp.Application.Dtos;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Bgp.Web.Helpers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly AppDbContext _db;
    public ChatController(AppDbContext db) => _db = db;

    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;

    [HttpGet("history/{otherUserId}")]
    public async Task<ActionResult<IEnumerable<ChatMessageDto>>> History(string otherUserId, [FromQuery] int take = 50)
    {
        take = Math.Clamp(take, 1, 200);
        var uid = UserId;

        var msgs = await _db.ChatMessages
            .Where(m => (m.SenderId == uid && m.ReceiverId == otherUserId) ||
                        (m.SenderId == otherUserId && m.ReceiverId == uid))
            .OrderByDescending(m => m.SentAtUtc)
            .Take(take)
            .OrderBy(m => m.SentAtUtc)
            .ToListAsync();

        var users = await _db.Users
            .Where(u => u.Id == uid || u.Id == otherUserId)
            .Select(u => new { u.Id, u.DisplayName, u.Email, u.UserName })
            .ToListAsync();

        var nameLookup = users.ToDictionary(
            u => u.Id,
            u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, u.Id));

        var dto = msgs.Select(m => new ChatMessageDto(
            m.Id,
            m.SenderId,
            m.ReceiverId,
            nameLookup.GetValueOrDefault(m.SenderId, m.SenderId.ToUpperInvariant()),
            nameLookup.GetValueOrDefault(m.ReceiverId, m.ReceiverId.ToUpperInvariant()),
            m.Content,
            m.SentAtUtc,
            m.SenderId == uid,
            m.IsRead,
            m.ReadAtUtc));

        return Ok(dto);
    }
}
