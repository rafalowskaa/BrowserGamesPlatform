using System.Linq;
using System.Security.Claims;
using Bgp.Application.Dtos;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/games/{gameId:guid}/matchmaking")]
public class MatchmakingController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMatchmakingService _matchmaking;

    public MatchmakingController(AppDbContext db, IMatchmakingService matchmaking)
    {
        _db = db;
        _matchmaking = matchmaking;
    }

    [Authorize]
    [HttpPost("find")]
    public async Task<ActionResult<MatchmakingTicketResponse>> Find(Guid gameId, [FromBody] MatchmakingRequest request, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        if (!await _db.Games.AnyAsync(g => g.Id == gameId, cancellationToken))
        {
            return NotFound();
        }

        if (!Enum.IsDefined(typeof(GameMode), request.Mode))
        {
            return BadRequest("Nieprawidłowy tryb gry.");
        }

        var mode = (GameMode)request.Mode;
        if (mode == GameMode.None)
        {
            return BadRequest("Nieprawidłowy tryb gry.");
        }

        var ticket = await _matchmaking.EnqueueAsync(gameId, userId, mode, cancellationToken);
        var response = await BuildResponseAsync(ticket, cancellationToken);
        return Ok(response);
    }

    [Authorize]
    [HttpGet("tickets/{ticketId:guid}")]
    public async Task<ActionResult<MatchmakingTicketResponse>> Get(Guid gameId, Guid ticketId, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var ticket = await _matchmaking.GetAsync(ticketId, cancellationToken);
        if (ticket is null || ticket.GameId != gameId || !string.Equals(ticket.UserId, userId, StringComparison.Ordinal))
        {
            return NotFound();
        }

        var response = await BuildResponseAsync(ticket, cancellationToken);
        return Ok(response);
    }

    [Authorize]
    [HttpDelete("tickets/{ticketId:guid}")]
    public async Task<ActionResult> Cancel(Guid gameId, Guid ticketId, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        if (string.IsNullOrEmpty(userId))
        {
            return Unauthorized();
        }

        var ticket = await _matchmaking.GetAsync(ticketId, cancellationToken);
        if (ticket is null || ticket.GameId != gameId || !string.Equals(ticket.UserId, userId, StringComparison.Ordinal))
        {
            return NotFound();
        }

        await _matchmaking.CancelAsync(ticketId, userId, cancellationToken);
        return NoContent();
    }

    private async Task<MatchmakingTicketResponse> BuildResponseAsync(MatchTicket ticket, CancellationToken cancellationToken)
    {
        var status = ticket.Cancelled
            ? "cancelled"
            : ticket.MatchId.HasValue
                ? "matched"
                : "waiting";

        string? opponentDisplayName = null;
        if (!string.IsNullOrEmpty(ticket.OpponentUserId))
        {
            opponentDisplayName = await _db.Users
                .Where(u => u.Id == ticket.OpponentUserId)
                .Select(u => u.DisplayName ?? u.UserName ?? u.Email)
                .FirstOrDefaultAsync(cancellationToken);
        }

        return new MatchmakingTicketResponse(
            ticket.Id,
            status,
            ticket.MatchId,
            ticket.OpponentUserId,
            opponentDisplayName,
            ticket.ExpiresAtUtc,
            ticket.MatchedAtUtc
        );
    }
}