using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Linq;

namespace Bgp.Infrastructure.Persistence;

public static class AppDbInitializer
{
    public static async Task MigrateAndSeedAsync(IServiceProvider sp)
    {
        using var scope = sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();

        var roleMgr = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var userMgr = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        // Role
        if (!await roleMgr.RoleExistsAsync("Admin"))
            await roleMgr.CreateAsync(new IdentityRole("Admin"));

        if (!await roleMgr.RoleExistsAsync("User"))
            await roleMgr.CreateAsync(new IdentityRole("User"));

        // Konto admina DEV (zmień hasło przed wdrożeniem!)
        var adminUserName = "admin";
        var adminEmail = "admin@bgp.local";
        var admin = await userMgr.FindByNameAsync(adminUserName) ?? await userMgr.FindByEmailAsync(adminEmail);

        const string adminPassword = "admin123";

        if (admin is null)
        {
            admin = new ApplicationUser
            {
                UserName = adminUserName,
                Email = adminEmail,
                EmailConfirmed = true,
                DisplayName = "Admin",
                DisplayNameLastApprovedAtUtc = DateTime.UtcNow,
                PresenceStatus = UserPresenceStatus.Offline,
                IsInvisible = false
            };
            var result = await userMgr.CreateAsync(admin, adminPassword);
            if (!result.Succeeded)
            {
                var errors = string.Join(", ", result.Errors.Select(e => e.Description));
                throw new InvalidOperationException($"Failed to create default admin user: {errors}");
            }
        }

        else if (!await userMgr.CheckPasswordAsync(admin, adminPassword))
        {
            var token = await userMgr.GeneratePasswordResetTokenAsync(admin);
            var reset = await userMgr.ResetPasswordAsync(admin, token, adminPassword);
            if (!reset.Succeeded)
            {
                var errors = string.Join(", ", reset.Errors.Select(e => e.Description));
                throw new InvalidOperationException($"Failed to reset default admin password: {errors}");
            }
        }

        if (!await userMgr.IsInRoleAsync(admin, "Admin"))
        {
            await userMgr.AddToRoleAsync(admin, "Admin");
        }

        if (!await userMgr.IsInRoleAsync(admin, "User"))
        {
            await userMgr.AddToRoleAsync(admin, "User");
        }

        var adminStateChanged = false;

        if (admin.LockoutEnabled)
        {
            admin.LockoutEnabled = false;
            adminStateChanged = true;
        }

        if (admin.LockoutEnd.HasValue || admin.AccessFailedCount > 0 || admin.IsBlocked)
        {
            admin.LockoutEnd = null;
            admin.AccessFailedCount = 0;
            admin.IsBlocked = false;
            adminStateChanged = true;
        }

        if (admin.PresenceStatus != UserPresenceStatus.Offline)
        {
            admin.PresenceStatus = UserPresenceStatus.Offline;
            adminStateChanged = true;
        }

        if (admin.IsInvisible)
        {
            admin.IsInvisible = false;
            adminStateChanged = true;
        }

        if (adminStateChanged)
        {
            await userMgr.UpdateAsync(admin);
        }
    }
}
