using System;
using System.Linq;
using System.Threading.Tasks;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/status")]
[Authorize]
public class StatusController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly IPresenceNotifier _presenceNotifier;

    public StatusController(UserManager<ApplicationUser> users, IPresenceNotifier presenceNotifier)
    {
        _users = users;
        _presenceNotifier = presenceNotifier;
    }

    [HttpGet]
    public async Task<ActionResult<UserStatusResponse>> Get()
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(new UserStatusResponse(user.StatusMessage, user.PresenceStatus, user.IsInvisible));
    }

    [HttpPut]
    public async Task<IActionResult> Update(UpdateStatusRequest request)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null)
        {
            return Unauthorized();
        }

        var normalizedMessage = string.IsNullOrWhiteSpace(request.StatusMessage)
            ? null
            : request.StatusMessage.Trim();

        if (normalizedMessage is not null && normalizedMessage.Length > 80)
        {
            return BadRequest(new { error = "Status message too long (80 characters max)." });
        }

        if (!Enum.IsDefined(typeof(UserPresenceStatus), request.Presence) || request.Presence == UserPresenceStatus.Offline)
        {
            return BadRequest(new { error = "Invalid presence selection." });
        }

        user.StatusMessage = normalizedMessage;
        user.PresenceStatus = request.Presence;
        user.IsInvisible = request.IsInvisible;

        var result = await _users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            var description = result.Errors.FirstOrDefault()?.Description ?? "Unable to update status.";
            return BadRequest(new { error = description });
        }

        await _presenceNotifier.BroadcastAsync(user.Id, user.StatusMessage, user.PresenceStatus, user.IsInvisible);

        return Ok(new UserStatusResponse(user.StatusMessage, user.PresenceStatus, user.IsInvisible));
    }

    public record UpdateStatusRequest(string? StatusMessage, UserPresenceStatus Presence, bool IsInvisible);

    public record UserStatusResponse(string? StatusMessage, UserPresenceStatus Presence, bool IsInvisible);
}