using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Linq;
using Bgp.Application.Dtos;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Bgp.Web.Helpers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using Bgp.Web.Hubs;
using Bgp.Web.Services;
using Microsoft.Extensions.Localization;
using Bgp.Web.Resources;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IChatMessageService _chatMessages;
    private readonly IHubContext<ChatHub> _hub;
    private readonly IStringLocalizer<SharedResource> _localizer;

    public ChatController(AppDbContext db, IChatMessageService chatMessages, IHubContext<ChatHub> hub, IStringLocalizer<SharedResource> localizer)
    {
        _db = db;
        _chatMessages = chatMessages;
        _hub = hub;
        _localizer = localizer;
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

        var unknownLabel = _localizer["Dashboard_Friends_Unknown"].Value;
        var nameLookup = users.ToDictionary(
                u => u.Id,
                u => DisplayNameFormatter.Format(u.DisplayName, u.Email, u.UserName, unknownLabel));

        var dto = msgs.Select(m => new ChatMessageDto(
            m.Id,
            m.SenderId,
            m.ReceiverId,
            nameLookup.GetValueOrDefault(m.SenderId, m.SenderId.ToUpperInvariant()),
            nameLookup.GetValueOrDefault(m.ReceiverId, m.ReceiverId.ToUpperInvariant()),
            m.IsDeleted ? string.Empty : m.Content,
            m.SentAtUtc,
            m.SenderId == uid,
            m.IsRead,
            m.ReadAtUtc,
            m.IsDeleted,
            m.DeletedAtUtc));

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
                payload.ReadAtUtc,
                payload.IsDeleted,
                payload.DeletedAtUtc);

            return Ok(dto);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("read/{otherUserId}")]
    public async Task<ActionResult> MarkThreadRead(string otherUserId)
    {
        var uid = UserId;
        if (string.IsNullOrWhiteSpace(uid))
            return Unauthorized();

        var unread = await _db.ChatMessages
            .Where(m => m.SenderId == otherUserId &&
                        m.ReceiverId == uid &&
                        !m.IsRead &&
                        !m.IsDeleted)
            .ToListAsync();

        if (unread.Count == 0)
            return NoContent();

        var now = DateTime.UtcNow;

        foreach (var message in unread)
        {
            message.IsRead = true;
            message.ReadAtUtc = now;
        }

        await _db.SaveChangesAsync();

        var payload = new
        {
            userId = uid,
            peerId = otherUserId,
            messageIds = unread.Select(m => m.Id).ToArray(),
            readAtUtc = now
        };

        await _hub.Clients.Group($"user-{otherUserId}").SendAsync("MessagesRead", payload);
        await _hub.Clients.Group($"user-{uid}").SendAsync("MessagesRead", payload);

        return Ok(payload);
    }

    [HttpDelete("messages/{id:guid}")]
    public async Task<ActionResult> DeleteMessage(Guid id)
    {
        var uid = UserId;
        if (string.IsNullOrEmpty(uid))
        {
            return Unauthorized();
        }

        var message = await _db.ChatMessages.FirstOrDefaultAsync(m => m.Id == id);
        if (message is null)
        {
            return NotFound();
        }

        if (message.SenderId != uid && message.ReceiverId != uid)
        {
            return Forbid();
        }

        if (!message.IsDeleted)
        {
            message.IsDeleted = true;
            message.DeletedAtUtc = DateTime.UtcNow;
            message.DeletedById = uid;
            message.Content = string.Empty;
            if (!message.IsRead)
            {
                message.IsRead = true;
                message.ReadAtUtc ??= message.DeletedAtUtc;
            }

            await _db.SaveChangesAsync();
        }

        var peerId = message.SenderId == uid ? message.ReceiverId : message.SenderId;
        var payload = new
        {
            messageId = message.Id,
            peerId,
            deletedById = message.DeletedById ?? uid,
            deletedAtUtc = message.DeletedAtUtc
        };

        await _hub.Clients.Group($"user-{uid}").SendAsync("MessageDeleted", payload);
        await _hub.Clients.Group($"user-{peerId}").SendAsync("MessageDeleted", payload);

        return Ok(payload);
    }
}
