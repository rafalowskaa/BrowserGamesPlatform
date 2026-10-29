using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bgp.Tests.Integration;

public sealed class ApiIntegrationTests : IClassFixture<IntegrationTestWebApplicationFactory>
{
    private readonly IntegrationTestWebApplicationFactory _factory;

    public ApiIntegrationTests(IntegrationTestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task IT_API_02_Protected_Endpoint_Requires_Auth_And_Allows_With_Auth()
    {
        var gameId = await SeedApprovedGameAsync();

        var anonymousClient = _factory.CreateClient();
        var unauthorized = await anonymousClient.PostAsJsonAsync($"/api/games/{gameId}/sessions", new { mode = (int)GameMode.Singleplayer });
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        var authenticatedClient = _factory.CreateClient();
        authenticatedClient.DefaultRequestHeaders.Add("X-Test-UserId", "user-it-02");
        authenticatedClient.DefaultRequestHeaders.Add("X-Test-Role", "User");

        var ok = await authenticatedClient.PostAsJsonAsync($"/api/games/{gameId}/sessions", new { mode = (int)GameMode.Singleplayer });
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
    }

    [Fact]
    public async Task IT_API_03_Games_Catalog_Returns_Only_Approved()
    {
        await SeedGameWithStatusAsync("approved-game", GameApprovalStatus.Approved);
        await SeedGameWithStatusAsync("pending-game", GameApprovalStatus.Pending);
        await SeedGameWithStatusAsync("rejected-game", GameApprovalStatus.Rejected);

        var client = _factory.CreateClient();
        var response = await client.GetFromJsonAsync<List<GameListItem>>("/api/games");

        Assert.NotNull(response);
        Assert.Contains(response!, g => g.Slug == "approved-game");
        Assert.DoesNotContain(response!, g => g.Slug == "pending-game");
        Assert.DoesNotContain(response!, g => g.Slug == "rejected-game");
    }

    [Fact]
    public async Task IT_API_04_Create_Game_Session_Returns_SessionId_And_Token()
    {
        var gameId = await SeedApprovedGameAsync();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-UserId", "user-it-04");

        var response = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions", new { mode = (int)GameMode.Singleplayer });
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.TryGetProperty("session_id", out _));
        Assert.True(body.TryGetProperty("token", out _));
        Assert.True(body.TryGetProperty("join_url", out _));
    }

    [Fact]
    public async Task IT_API_05_Submit_Score_Saves_And_Affects_Leaderboard()
    {
        var gameId = await SeedApprovedGameAsync();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-UserId", "user-it-05");

        var createSession = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions", new { mode = (int)GameMode.Singleplayer });
        var createBody = await createSession.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = createBody.GetProperty("session_id").GetGuid();
        var token = createBody.GetProperty("token").GetString();

        var submit = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions/{sessionId}/score", new { token, value = 321, outcome = "win" });
        Assert.Equal(HttpStatusCode.OK, submit.StatusCode);

        var leaderboard = await client.GetStringAsync($"/api/games/{gameId}/leaderboard");
        Assert.Contains("321", leaderboard);
    }

    [Fact]
    public async Task IT_API_06_Submit_Score_Without_Or_Wrong_Token_Is_Rejected()
    {
        var gameId = await SeedApprovedGameAsync();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-UserId", "user-it-06");

        var createSession = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions", new { mode = (int)GameMode.Singleplayer });
        var createBody = await createSession.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = createBody.GetProperty("session_id").GetGuid();

        var missingToken = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions/{sessionId}/score", new { token = "", value = 50 });
        Assert.Equal(HttpStatusCode.Unauthorized, missingToken.StatusCode);

        var wrongToken = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions/{sessionId}/score", new { token = "wrong-token", value = 50 });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongToken.StatusCode);
    }

    [Fact]
    public async Task IT_API_07_Submit_Score_Is_Idempotent_For_Retry()
    {
        var gameId = await SeedApprovedGameAsync();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-UserId", "user-it-07");

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
    public async Task IT_API_08_Parallel_Submit_Score_Does_Not_Duplicate_Record()
    {
        var gameId = await SeedApprovedGameAsync();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-UserId", "user-it-08");

        var createSession = await client.PostAsJsonAsync($"/api/games/{gameId}/sessions", new { mode = (int)GameMode.Singleplayer });
        var createBody = await createSession.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = createBody.GetProperty("session_id").GetGuid();
        var token = createBody.GetProperty("token").GetString();

        var t1 = client.PostAsJsonAsync($"/api/games/{gameId}/sessions/{sessionId}/score", new { token, value = 100 });
        var t2 = client.PostAsJsonAsync($"/api/games/{gameId}/sessions/{sessionId}/score", new { token, value = 100 });
        await Task.WhenAll(t1, t2);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var count = await db.Scores.CountAsync(s => s.MatchSessionId == sessionId);
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task IT_API_10_Comments_Add_Cooldown_And_Max_Length()
    {
        var (gameId, userId) = await SeedApprovedGameWithUserAsync("user-it-10");
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-UserId", userId);

        var first = await client.PostAsJsonAsync($"/api/games/{gameId}/comments", new { text = "Pierwszy komentarz" });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await client.PostAsJsonAsync($"/api/games/{gameId}/comments", new { text = "Drugi komentarz za szybko" });
        Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);

        var longText = new string('x', 2001);
        var tooLong = await client.PostAsJsonAsync($"/api/games/{gameId}/comments", new { text = longText });
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
    }

    [Fact]
    public async Task IT_API_11_Admin_Access_Control_Works()
    {
        var clientUser = _factory.CreateClient();
        clientUser.DefaultRequestHeaders.Add("X-Test-UserId", "user-it-11");
        clientUser.DefaultRequestHeaders.Add("X-Test-Role", "User");

        var forbidden = await clientUser.GetAsync("/api/admin/users");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var clientAdmin = _factory.CreateClient();
        clientAdmin.DefaultRequestHeaders.Add("X-Test-UserId", "admin-it-11");
        clientAdmin.DefaultRequestHeaders.Add("X-Test-Role", "Admin");

        var ok = await clientAdmin.GetAsync("/api/admin/users");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact]
    public async Task IT_API_12_Leaderboard_Csv_Matches_Leaderboard_View()
    {
        var gameId = await SeedApprovedGameAsync();
        await SeedScoreAsync(gameId, "user-csv-1", 500);
        await SeedScoreAsync(gameId, "user-csv-2", 300);

        var client = _factory.CreateClient();
        var json = await client.GetStringAsync($"/api/games/{gameId}/leaderboard");
        var csv = await client.GetStringAsync($"/api/games/{gameId}/leaderboard/export");

        Assert.Contains("500", json);
        Assert.Contains("300", json);
        Assert.Contains("500", csv);
        Assert.Contains("300", csv);
    }

    private async Task<Guid> SeedApprovedGameAsync()
    {
        var (gameId, _) = await SeedApprovedGameWithUserAsync($"user-{Guid.NewGuid():N}");
        return gameId;
    }

    private async Task<(Guid gameId, string userId)> SeedApprovedGameWithUserAsync(string userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

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
        return (gameId, userId);
    }

    private async Task SeedGameWithStatusAsync(string slug, GameApprovalStatus status)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var userId = $"owner-{slug}";
        if (!await db.Users.AnyAsync(u => u.Id == userId))
        {
            db.Users.Add(new ApplicationUser { Id = userId, UserName = userId, Email = $"{userId}@local.test" });
        }

        db.Games.Add(new Game
        {
            Id = Guid.NewGuid(),
            Title = slug,
            Slug = slug,
            CreatedByUserId = userId,
            ApprovalStatus = status,
            Modes = GameMode.Singleplayer
        });

        await db.SaveChangesAsync();
    }

    private async Task SeedScoreAsync(Guid gameId, string userId, double value)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        if (!await db.Users.AnyAsync(u => u.Id == userId))
        {
            db.Users.Add(new ApplicationUser { Id = userId, UserName = userId, Email = $"{userId}@local.test" });
        }

        var sessionId = Guid.NewGuid();
        db.MatchSessions.Add(new MatchSession
        {
            Id = sessionId,
            GameId = gameId,
            UserId = userId,
            Used = true,
            Mode = GameMode.Singleplayer,
            Token = "seed-token",
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-5),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1)
        });
        db.SessionPlayers.Add(new SessionPlayer
        {
            SessionId = sessionId,
            UserId = userId,
            TokenHash = $"seed-{Guid.NewGuid():N}",
            Role = "winner",
            JoinedAtUtc = DateTime.UtcNow.AddMinutes(-5)
        });
        db.Scores.Add(new Score
        {
            GameId = gameId,
            UserId = userId,
            MatchSessionId = sessionId,
            Verified = true,
            Value = value,
            Mode = GameMode.Singleplayer,
            SubmittedAtUtc = DateTime.UtcNow
        });

        await db.SaveChangesAsync();
    }

    private sealed record GameListItem(Guid Id, string Title, string Slug);
}