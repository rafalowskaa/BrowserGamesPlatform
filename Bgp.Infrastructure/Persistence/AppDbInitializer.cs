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

        // Konto admina DEV (zmień hasło przed wdrożeniem!)
        var adminUserName = "admin";
        var adminEmail = "admin@bgp.local";
        var admin = await userMgr.FindByNameAsync(adminUserName) ?? await userMgr.FindByEmailAsync(adminEmail);
        
        if (admin is null)
        {
            admin = new ApplicationUser
            {
                UserName = adminUserName,
                Email = adminEmail,
                EmailConfirmed = true,
                DisplayName = "Admin"
            };
            await userMgr.CreateAsync(admin, "Passw0rd!");
            var result = await userMgr.CreateAsync(admin, "admin");
            if (!result.Succeeded)
            {
                var errors = string.Join(", ", result.Errors.Select(e => e.Description));
                throw new InvalidOperationException($"Failed to create default admin user: {errors}");
            }
        }

        if (!await userMgr.IsInRoleAsync(admin, "Admin"))
        {
            await userMgr.AddToRoleAsync(admin, "Admin");
        }
        var hasPassword = await userMgr.HasPasswordAsync(admin);
        if (!hasPassword)
        {
            await userMgr.AddPasswordAsync(admin, "admin");
        }
        else if (!await userMgr.CheckPasswordAsync(admin, "admin"))
        {
            await userMgr.RemovePasswordAsync(admin);
            await userMgr.AddPasswordAsync(admin, "admin");
        }
    }
}
