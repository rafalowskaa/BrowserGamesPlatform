using Bgp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using Microsoft.Extensions.DependencyInjection;

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

        const string adminPassword = "admin";

        if (admin is null)
        {
            admin = new ApplicationUser
            {
                UserName = adminUserName,
                Email = adminEmail,
                EmailConfirmed = true,
                DisplayName = "Admin"
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
    }
}
