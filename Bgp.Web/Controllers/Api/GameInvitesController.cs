using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Hubs;
using Bgp.Web.Resources;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;
using Bgp.Web.Services;

namespace Bgp.Web.Controllers.Api;

[ApiController]
public class GameInvitesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<InvitesHub> _hub;
    private readonly IStringLocalizer<SharedResource> _localizer;
    private readonly IActivityLogger _logger;

    private static readonly TimeSpan InviteWindow = TimeSpan.FromMinutes(5);

    public GameInvitesController(AppDbContext db, IHubContext<InvitesHub> hub, IStringLocalizer<SharedResource> localizer, IActivityLogger logger)
    {
        _db = db;
        _hub = hub;
        _localizer = localizer;
        _logger = logger;
    }

    public class InviteRequest
    {
        [Required, MaxLength(450)]
        public string FriendId { get; set; } = string.Empty;
    }

    [Authorize]
    [HttpPost("api/sessions/{sessionId:guid}/invites")]
    public async Task<ActionResult> Create(Guid sessionId, [FromBody] InviteRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var session = await _db.MatchSessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId);
        if (session is null || session.ExpiresAtUtc < DateTime.UtcNow)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(request.FriendId) || string.Equals(request.FriendId, userId, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { code = "invalid_target", message = _localizer["Games_Details_InviteError"].Value });
        }

        var recentInvites = await _db.GameInvites
            .Where(i => i.SessionId == sessionId && i.FromUserId == userId && i.CreatedAtUtc > DateTime.UtcNow.Subtract(InviteWindow))
            .CountAsync();

        if (recentInvites >= 10)
        {
            return StatusCode(429, new { code = "invite_rate_limited", message = _localizer["Games_Details_InviteError"].Value });
        }

        var invite = new GameInvite
        {
            SessionId = sessionId,
            FromUserId = userId,
            ToUserId = request.FriendId,
            Mode = session.Mode.ToString(),
            Status = GameInviteStatus.Pending,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.GameInvites.Add(invite);
        await _db.SaveChangesAsync();
        await _logger.LogAsync(ActivityLogType.GameInviteSent, userId, log =>
        {
            log.InviteId = invite.Id;
            log.TargetUserId = request.FriendId;
            log.GameId = session.GameId;
        });

        await _hub.Clients.Group($"user-{request.FriendId}")
            .SendAsync("InviteReceived", new
            {
                invite_id = invite.Id,
                session_id = invite.SessionId,
                from_user_id = invite.FromUserId,
                mode = invite.Mode
            });

        return Created(string.Empty, new { invite_id = invite.Id, status = invite.Status });
    }

    [Authorize]
    [HttpPost("api/invites/{inviteId:guid}/accept")]
    public async Task<ActionResult> Accept(Guid inviteId)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var invite = await _db.GameInvites.FirstOrDefaultAsync(i => i.Id == inviteId && i.ToUserId == userId);
        if (invite is null)
        {
            return NotFound();
        }

        if (invite.Status != GameInviteStatus.Pending)
        {
            return Conflict(new { code = "invite_not_pending", status = invite.Status });
        }

        var session = await _db.MatchSessions.FirstOrDefaultAsync(s => s.Id == invite.SessionId);
        if (session is null || session.ExpiresAtUtc < DateTime.UtcNow)
        {
            invite.Status = GameInviteStatus.Expired;
            invite.RespondedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return StatusCode(410, new { code = "invite_expired" });
        }

        var now = DateTime.UtcNow;
        invite.Status = GameInviteStatus.Accepted;
        invite.RespondedAtUtc = now;

        var existingPlayer = await _db.SessionPlayers.FirstOrDefaultAsync(p => p.SessionId == session.Id && p.UserId == userId);
        if (existingPlayer is null)
        {
            _db.SessionPlayers.Add(new SessionPlayer
            {
                SessionId = session.Id,
                UserId = userId,
                Role = "guest",
                JoinedAtUtc = now
            });
        }

        await _db.SaveChangesAsync();
        await _logger.LogAsync(ActivityLogType.GameInviteAccepted, userId, log =>
        {
            log.InviteId = invite.Id;
            log.TargetUserId = invite.FromUserId;
            log.GameId = session.GameId;
        });

        var joinUrl = Url.Action("Details", "Games", new { slug = (await _db.Games.Where(g => g.Id == session.GameId).Select(g => g.Slug).FirstOrDefaultAsync()), tab = "play", sessionId = session.Id, token = session.Token }, Request.Scheme);

        await _hub.Clients.Group($"user-{invite.FromUserId}")
            .SendAsync("InviteAccepted", new
            {
                invite_id = invite.Id,
                session_id = invite.SessionId,
                from_user_id = invite.FromUserId,
                to_user_id = invite.ToUserId
            });

        return Ok(new
        {
            session_id = session.Id,
            token = session.Token,
            ws_url = session.WsUrl,
            join_url = joinUrl
        });
    }
}