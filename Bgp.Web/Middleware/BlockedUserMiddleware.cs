using Bgp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;

namespace Bgp.Web.Middleware;

public sealed class BlockedUserMiddleware
{
    private readonly RequestDelegate _next;

    public BlockedUserMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, UserManager<ApplicationUser> userManager, SignInManager<ApplicationUser> signInManager)
    {
        if (context.User?.Identity?.IsAuthenticated == true)
        {
            var user = await userManager.GetUserAsync(context.User);
            if (user is not null && user.IsBlocked)
            {
                if (user.BlockedUntilUtc.HasValue && user.BlockedUntilUtc.Value <= DateTime.UtcNow)
                {
                    user.IsBlocked = false;
                    user.BlockedUntilUtc = null;
                    await userManager.UpdateAsync(user);
                }
                else
                {
                    await signInManager.SignOutAsync();

                    if (context.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase))
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        return;
                    }

                    var isLoginPage = context.Request.Path.StartsWithSegments("/Account/Login", StringComparison.OrdinalIgnoreCase);
                    if (!isLoginPage)
                    {
                        context.Response.Redirect("/Account/Login?intent=blocked");
                        return;
                    }
                }
            }
        }

        await _next(context);
    }
}