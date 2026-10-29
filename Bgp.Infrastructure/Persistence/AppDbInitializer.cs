using System;
using System.Linq;
using System.Threading.Tasks;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Bgp.Infrastructure.Persistence;

public static class AppDbInitializer
{
    public static async Task MigrateAndSeedAsync(IServiceProvider sp)
    {
        using var scope = sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var providerName = db.Database.ProviderName ?? string.Empty;
        if (providerName.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            await db.Database.EnsureCreatedAsync();
        }
        else
        {
            await db.Database.MigrateAsync();
        }

        var roleMgr = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var userMgr = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        foreach (var role in new[] { "Admin", "Moderator", "User" })
        {
            if (!await roleMgr.RoleExistsAsync(role))
            {
                var result = await roleMgr.CreateAsync(new IdentityRole(role));
                if (!result.Succeeded)
                {
                    throw new InvalidOperationException(
                        $"Failed to create role '{role}': {string.Join(", ", result.Errors.Select(e => e.Code))}");
                }
            }
        }

        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        if (!configuration.GetValue<bool>("BootstrapAdmin:Enabled"))
        {
            return;
        }

        var userName = configuration["BootstrapAdmin:UserName"];
        var email = configuration["BootstrapAdmin:Email"];
        if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrWhiteSpace(email))
        {
            throw new InvalidOperationException(
                "Administrator bootstrap requires BootstrapAdmin:UserName and BootstrapAdmin:Email.");
        }

        // Bootstrap creates a new account only. Existing accounts retain their
        // passwords, roles, lockout, moderation and presence settings.
        var existing = await userMgr.FindByNameAsync(userName) ?? await userMgr.FindByEmailAsync(email);
        if (existing is not null)
        {
            return;
        }

        var password = configuration["BootstrapAdmin:Password"];
        if (string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException(
                "Administrator bootstrap requires BootstrapAdmin:Password from local configuration or the environment.");
        }

        var admin = new ApplicationUser
        {
            UserName = userName,
            Email = email,
            EmailConfirmed = true,
            DisplayName = "Admin",
            DisplayNameLastApprovedAtUtc = DateTime.UtcNow,
            PresenceStatus = UserPresenceStatus.Offline,
            IsInvisible = false
        };

        var created = await userMgr.CreateAsync(admin, password);
        if (!created.Succeeded)
        {
            throw new InvalidOperationException(
                $"Failed to create bootstrap administrator: {string.Join(", ", created.Errors.Select(e => e.Code))}");
        }

        var assigned = await userMgr.AddToRolesAsync(admin, new[] { "Admin", "User" });
        if (!assigned.Succeeded)
        {
            throw new InvalidOperationException(
                $"Failed to assign bootstrap administrator roles: {string.Join(", ", assigned.Errors.Select(e => e.Code))}");
        }
    }
}
