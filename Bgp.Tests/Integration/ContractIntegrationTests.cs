using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bgp.Tests.Integration;

public sealed class ContractIntegrationTests : IClassFixture<IntegrationTestWebApplicationFactory>
{
    private readonly IntegrationTestWebApplicationFactory _factory;

    public ContractIntegrationTests(IntegrationTestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task CT_01_Game_Receives_Session_Contract_And_Mode_Is_Persisted()
    {
        var gameId = await SeedApprovedGameAsync();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-UserId", "user-ct-01");

        var response = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions", new { mode = (int)GameMode.MultiplayerRealtime });
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = body.GetProperty("session_id").GetGuid();
        var token = body.GetProperty("token").GetString();
        var joinUrl = body.GetProperty("join_url").GetString();

        Assert.False(string.IsNullOrWhiteSpace(token));
        Assert.False(string.IsNullOrWhiteSpace(joinUrl));
        Assert.Contains($"sessionId={sessionId}", joinUrl, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("token=", joinUrl, StringComparison.OrdinalIgnoreCase);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var session = await db.MatchSessions.FirstAsync(s => s.Id == sessionId);

        Assert.Equal(gameId, session.GameId);
        Assert.Equal(GameMode.MultiplayerRealtime, session.Mode);
    }

    [Fact]
    public async Task CT_02_Submit_Score_Works_For_Warcaby_Durak_Klondike()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-UserId", "user-ct-02");

        var gameIds = await SeedContractGamesAsync();

        foreach (var gameId in gameIds)
        {
            var createSession = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions", new { mode = (int)GameMode.Singleplayer });
            createSession.EnsureSuccessStatusCode();

            var createBody = await createSession.Content.ReadFromJsonAsync<JsonElement>();
            var sessionId = createBody.GetProperty("session_id").GetGuid();
            var token = createBody.GetProperty("token").GetString();

            var submit = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions/{sessionId}/score", new { token, value = 777, outcome = "win" });
            Assert.Equal(HttpStatusCode.OK, submit.StatusCode);

            var leaderboard = await client.GetStringAsync($"/api/games/{gameId}/leaderboard");
            Assert.Contains("777", leaderboard);
        }
    }

    [Fact]
    public async Task CT_03_Submit_Score_Retry_Does_Not_Create_Duplicate()
    {
        var gameId = await SeedApprovedGameAsync();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-UserId", "user-ct-03");

        var createSession = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions", new { mode = (int)GameMode.Singleplayer });
        var createBody = await createSession.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = createBody.GetProperty("session_id").GetGuid();
        var token = createBody.GetProperty("token").GetString();

        _ = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions/{sessionId}/score", new { token, value = 100 });
        _ = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions/{sessionId}/score", new { token, value = 120 });

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var count = await db.Scores.CountAsync(s => s.MatchSessionId == sessionId);
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task CT_04_Submit_Score_After_Session_Expiry_Is_Rejected()
    {
        var gameId = await SeedApprovedGameAsync();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-UserId", "user-ct-04");

        var createSession = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions", new { mode = (int)GameMode.Singleplayer });
        createSession.EnsureSuccessStatusCode();

        var createBody = await createSession.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = createBody.GetProperty("session_id").GetGuid();
        var token = createBody.GetProperty("token").GetString();

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var session = await db.MatchSessions.FirstAsync(s => s.Id == sessionId);
            session.ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }

        var submit = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions/{sessionId}/score", new { token, value = 123 });
        Assert.Equal(HttpStatusCode.Unauthorized, submit.StatusCode);
    }

    private async Task<Guid> SeedApprovedGameAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var userId = $"user-{Guid.NewGuid():N}";
        if (!await db.Users.AnyAsync(u => u.Id == userId))
        {
            db.Users.Add(new ApplicationUser { Id = userId, UserName = userId, Email = $"{userId}@local.test" });
        }

        var gameId = Guid.NewGuid();
        db.Games.Add(new Game
        {
            Id = gameId,
            Title = $"Game-{gameId:N}",
            Slug = $"game-{gameId:N}",
            CreatedByUserId = userId,
            ApprovalStatus = GameApprovalStatus.Approved,
            Modes = GameMode.Singleplayer | GameMode.MultiplayerRealtime
        });

        await db.SaveChangesAsync();
        return gameId;
    }

    private async Task<IReadOnlyList<Guid>> SeedContractGamesAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var userId = "owner-contract-tests";
        if (!await db.Users.AnyAsync(u => u.Id == userId))
        {
            db.Users.Add(new ApplicationUser { Id = userId, UserName = userId, Email = $"{userId}@local.test" });
        }

        var slugs = new[] { "warcaby", "durak", "klondike" };
        var ids = new List<Guid>(slugs.Length);

        foreach (var slug in slugs)
        {
            var gameId = Guid.NewGuid();
            ids.Add(gameId);
            db.Games.Add(new Game
            {
                Id = gameId,
                Title = slug,
                Slug = $"{slug}-{gameId:N}",
                CreatedByUserId = userId,
                ApprovalStatus = GameApprovalStatus.Approved,
                Modes = GameMode.Singleplayer | GameMode.MultiplayerRealtime
            });
        }

        await db.SaveChangesAsync();
        return ids;
    }
}