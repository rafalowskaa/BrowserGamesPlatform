using System.Collections.Generic;
using System.Security.Claims;
using Bgp.Application.Dtos;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Bgp.Web.Helpers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using Bgp.Web.Hubs;
using Bgp.Web.Services;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IChatMessageService _chatMessages;
    private readonly IHubContext<ChatHub> _hub;

    public ChatController(AppDbContext db, IChatMessageService chatMessages, IHubContext<ChatHub> hub)
    {
        _db = db;
        _chatMessages = chatMessages;
        _hub = hub;
    }

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

    [HttpPost("messages")]
    public async Task<ActionResult<ChatMessageDto>> SendMessage([FromBody] SendMessageRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.ToUserId) || string.IsNullOrWhiteSpace(request.Content))
        {
            return BadRequest(new { error = "Invalid payload." });
        }

        var senderId = UserId;
        if (string.IsNullOrWhiteSpace(senderId))
        {
            return Unauthorized();
        }

        try
        {
            var payload = await _chatMessages.CreateAsync(senderId, request.ToUserId, request.Content);

            await _hub.Clients.Group($"user-{request.ToUserId}").SendAsync("ReceiveMessage", payload);
            await _hub.Clients.Group($"user-{senderId}").SendAsync("ReceiveMessage", payload);

            var dto = new ChatMessageDto(
                payload.Id,
                payload.SenderId,
                payload.ReceiverId,
                payload.SenderName,
                payload.ReceiverName,
                payload.Content,
                payload.SentAtUtc,
                true,
                payload.IsRead,
                payload.ReadAtUtc);

            return Ok(dto);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
