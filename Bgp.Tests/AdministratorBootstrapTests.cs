using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Bgp.Tests;

public sealed class AdministratorBootstrapTests
{
    [Fact]
    public async Task Disabled_bootstrap_creates_roles_without_creating_an_administrator()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        using var provider = BuildProvider(connection, new Dictionary<string, string?>());

        await AppDbInitializer.MigrateAndSeedAsync(provider);

        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.Users.ToListAsync());
        Assert.Equal(3, await db.Roles.CountAsync());
    }

    [Fact]
    public async Task Enabled_bootstrap_requires_a_password_for_a_new_account()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        var settings = Settings();
        settings.Remove("BootstrapAdmin:Password");
        using var provider = BuildProvider(connection, settings);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => AppDbInitializer.MigrateAndSeedAsync(provider));

        Assert.Contains("BootstrapAdmin:Password", error.Message);
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.Users.ToListAsync());
    }

    [Fact]
    public async Task Enabled_bootstrap_creates_an_administrator_with_the_configured_password()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        using var provider = BuildProvider(connection, Settings());

        await AppDbInitializer.MigrateAndSeedAsync(provider);

        using var scope = provider.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var admin = await users.FindByNameAsync("bootstrap-test");
        Assert.NotNull(admin);
        Assert.True(await users.CheckPasswordAsync(admin!, "OnlyForTests-123!"));
        Assert.True(await users.IsInRoleAsync(admin!, "Admin"));
        Assert.True(await users.IsInRoleAsync(admin!, "User"));
    }

    [Fact]
    public async Task Repeated_bootstrap_preserves_existing_credentials_and_moderation()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        using var provider = BuildProvider(connection, Settings());
        await AppDbInitializer.MigrateAndSeedAsync(provider);

        using (var scope = provider.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var admin = (await users.FindByNameAsync("bootstrap-test"))!;
            var passwordResult = await users.ChangePasswordAsync(
                admin, "OnlyForTests-123!", "ChangedForTests-456!");
            Assert.True(passwordResult.Succeeded);
            admin.IsBlocked = true;
            admin.BlockReason = "test moderation";
            admin.LockoutEnabled = true;
            admin.LockoutEnd = DateTimeOffset.UtcNow.AddDays(1);
            admin.AccessFailedCount = 3;
            Assert.True((await users.UpdateAsync(admin)).Succeeded);
        }

        await AppDbInitializer.MigrateAndSeedAsync(provider);

        using (var scope = provider.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var admin = (await users.FindByNameAsync("bootstrap-test"))!;
            Assert.True(await users.CheckPasswordAsync(admin, "ChangedForTests-456!"));
            Assert.False(await users.CheckPasswordAsync(admin, "OnlyForTests-123!"));
            Assert.True(admin.IsBlocked);
            Assert.Equal("test moderation", admin.BlockReason);
            Assert.True(admin.LockoutEnabled);
            Assert.True(admin.LockoutEnd > DateTimeOffset.UtcNow);
            Assert.Equal(3, admin.AccessFailedCount);
        }
    }

    [Fact]
    public async Task Bootstrap_does_not_promote_an_existing_regular_user()
    {
        await using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>()).Build();
        using var provider = BuildProvider(connection, configuration);
        await AppDbInitializer.MigrateAndSeedAsync(provider);

        using (var scope = provider.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser
            {
                UserName = "bootstrap-test",
                Email = "bootstrap@example.test"
            };
            Assert.True((await users.CreateAsync(user, "RegularUserForTests-123!")).Succeeded);
        }

        foreach (var setting in Settings())
        {
            configuration[setting.Key] = setting.Value;
        }
        await AppDbInitializer.MigrateAndSeedAsync(provider);

        using (var scope = provider.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = (await users.FindByNameAsync("bootstrap-test"))!;
            Assert.False(await users.IsInRoleAsync(user, "Admin"));
            Assert.True(await users.CheckPasswordAsync(user, "RegularUserForTests-123!"));
        }
    }

    private static Dictionary<string, string?> Settings() => new()
    {
        ["BootstrapAdmin:Enabled"] = "true",
        ["BootstrapAdmin:UserName"] = "bootstrap-test",
        ["BootstrapAdmin:Email"] = "bootstrap@example.test",
        ["BootstrapAdmin:Password"] = "OnlyForTests-123!"
    };

    private static ServiceProvider BuildProvider(SqliteConnection connection,
        Dictionary<string, string?> settings) =>
        BuildProvider(connection, new ConfigurationBuilder().AddInMemoryCollection(settings).Build());

    private static ServiceProvider BuildProvider(SqliteConnection connection, IConfiguration configuration)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDataProtection();
        services.AddSingleton(configuration);
        services.AddDbContext<AppDbContext>(options => options.UseSqlite(connection));
        services.AddIdentity<ApplicationUser, IdentityRole>(options =>
        {
            options.Password.RequiredLength = 8;
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequireUppercase = false;
            options.Password.RequireDigit = false;
            options.User.RequireUniqueEmail = true;
        }).AddEntityFrameworkStores<AppDbContext>().AddDefaultTokenProviders();
        return services.BuildServiceProvider();
    }
}
