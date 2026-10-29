using System.Data.Common;
using Bgp.Infrastructure.Persistence;
using WebProgram = Program;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bgp.Tests.Integration;

public sealed class IntegrationTestWebApplicationFactory : WebApplicationFactory<WebProgram>, IAsyncLifetime
{
    private readonly DbConnection _connection = new SqliteConnection($"Data Source=bgp-tests-{Guid.NewGuid():N};Mode=Memory;Cache=Shared;Pooling=False");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureServices(services =>
        {
            var dbOptionsDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            if (dbOptionsDescriptor is not null)
            {
                services.Remove(dbOptionsDescriptor);
            }

            var dbContextDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(AppDbContext));
            if (dbContextDescriptor is not null)
            {
                services.Remove(dbContextDescriptor);
            }

            // Keep the named in-memory database alive through _connection, but give each
            // request its own connection. Sharing one connection across parallel requests
            // allows EF to register SQLite functions while another statement is active.
            services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection.ConnectionString));

            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = TestAuthHandler.Scheme;
                options.DefaultChallengeScheme = TestAuthHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.Scheme, _ => { });
        });
    }

    public async Task InitializeAsync()
    {
        await _connection.OpenAsync();

        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureCreatedAsync();
    }

    public new async Task DisposeAsync()
    {
        await _connection.DisposeAsync();
    }
}