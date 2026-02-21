using Bgp.Application.Dtos;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Controllers.Api;
using Bgp.Web.Helpers;
using Bgp.Web.Resources;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Localization;
using System;
using System.Globalization;

namespace Bgp.Tests;

public class SessionScoreTests
{
    [Fact]
    public async Task SubmitScore_Stores_Verified_Score()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"score-submit-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        var userId = "user-1";
        var sessionId = Guid.NewGuid();
        var token = SessionTokenUtilities.GenerateToken();
        var tokenHash = SessionTokenUtilities.HashToken(token);

        await using var db = new AppDbContext(options);
        db.Games.Add(new Game
        {
            Id = gameId,
            Title = "Test Game",
            Slug = "test-game",
            CreatedByUserId = userId,
            ApprovalStatus = GameApprovalStatus.Approved
        });
        db.Users.Add(new ApplicationUser
        {
            Id = userId,
            UserName = "player-one",
            Email = "player-one@example.com"
        });
        db.MatchSessions.Add(new MatchSession
        {
            Id = sessionId,
            GameId = gameId,
            UserId = userId,
            Mode = GameMode.MultiplayerRealtime,
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-10),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(20)
        });
        db.SessionPlayers.Add(new SessionPlayer
        {
            SessionId = sessionId,
            UserId = userId,
            TokenHash = tokenHash,
            Role = "host",
            JoinedAtUtc = DateTime.UtcNow.AddMinutes(-10)
        });
        await db.SaveChangesAsync();

        var controller = new GameSessionsController(db, new TestStringLocalizer(), new NullActivityLogger());
        var result = await controller.SubmitScore(gameId, sessionId, new GameSessionsController.SubmitSessionScoreRequest
        {
            Token = token,
            Value = 12,
            Outcome = "win"
        });

        Assert.IsType<OkObjectResult>(result);

        var score = await db.Scores.SingleAsync();
        Assert.True(score.Verified);
        Assert.Equal(12, score.Value);
        Assert.Equal(sessionId, score.MatchSessionId);
        Assert.Equal(userId, score.UserId);
        Assert.Equal(GameMode.MultiplayerRealtime, score.Mode);

        var player = await db.SessionPlayers.SingleAsync();
        Assert.Equal("winner", player.Role);
    }


    [Fact]
    public async Task SubmitScore_Is_Idempotent_For_10_Retries_And_Returns_Ok()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"score-idempotency-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        var userId = "user-1";
        var sessionId = Guid.NewGuid();
        var token = SessionTokenUtilities.GenerateToken();
        var tokenHash = SessionTokenUtilities.HashToken(token);

        await using var db = new AppDbContext(options);
        SeedBasicSession(db, gameId, userId, sessionId, tokenHash, DateTime.UtcNow.AddMinutes(20));
        await db.SaveChangesAsync();

        var controller = new GameSessionsController(db, new TestStringLocalizer(), new NullActivityLogger());
        for (var attempt = 0; attempt < 10; attempt++)
        {
            var result = await controller.SubmitScore(gameId, sessionId, new GameSessionsController.SubmitSessionScoreRequest
            {
                Token = token,
                Value = 100 + attempt,
                Outcome = "win"
            });

            Assert.IsType<OkObjectResult>(result);
        }

        Assert.Equal(1, await db.Scores.CountAsync());
        var score = await db.Scores.SingleAsync();
        Assert.Equal(109, score.Value);
    }

    [Fact]
    public async Task SubmitScore_Without_Token_Returns_Unauthorized()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"score-no-token-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        var userId = "user-1";
        var sessionId = Guid.NewGuid();

        await using var db = new AppDbContext(options);
        SeedBasicSession(db, gameId, userId, sessionId, tokenHash: "unused", DateTime.UtcNow.AddMinutes(20));
        await db.SaveChangesAsync();

        var controller = new GameSessionsController(db, new TestStringLocalizer(), new NullActivityLogger());
        var result = await controller.SubmitScore(gameId, sessionId, new GameSessionsController.SubmitSessionScoreRequest
        {
            Token = "",
            Value = 10
        });

        Assert.IsType<UnauthorizedResult>(result);
    }

    [Fact]
    public async Task SubmitScore_After_Session_Expiry_Returns_Unauthorized()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"score-expired-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        var userId = "user-1";
        var sessionId = Guid.NewGuid();
        var token = SessionTokenUtilities.GenerateToken();
        var tokenHash = SessionTokenUtilities.HashToken(token);

        await using var db = new AppDbContext(options);
        SeedBasicSession(db, gameId, userId, sessionId, tokenHash, DateTime.UtcNow.AddMinutes(-1));
        await db.SaveChangesAsync();

        var controller = new GameSessionsController(db, new TestStringLocalizer(), new NullActivityLogger());
        var result = await controller.SubmitScore(gameId, sessionId, new GameSessionsController.SubmitSessionScoreRequest
        {
            Token = token,
            Value = 20
        });

        Assert.IsType<UnauthorizedResult>(result);
    }

    [Fact]
    public async Task SubmitScore_With_Wrong_GameId_Returns_BadRequest()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"score-wrong-game-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        var wrongGameId = Guid.NewGuid();
        var userId = "user-1";
        var sessionId = Guid.NewGuid();
        var token = SessionTokenUtilities.GenerateToken();
        var tokenHash = SessionTokenUtilities.HashToken(token);

        await using var db = new AppDbContext(options);
        SeedBasicSession(db, gameId, userId, sessionId, tokenHash, DateTime.UtcNow.AddMinutes(20));
        await db.SaveChangesAsync();

        var controller = new GameSessionsController(db, new TestStringLocalizer(), new NullActivityLogger());
        var result = await controller.SubmitScore(wrongGameId, sessionId, new GameSessionsController.SubmitSessionScoreRequest
        {
            Token = token,
            Value = 20
        });

        Assert.IsType<BadRequestObjectResult>(result);
    }


    [Fact]
    public async Task Leaderboard_Uses_Scores_For_Wins_And_Losses()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"leaderboard-scores-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();
        var playerOneId = "user-1";
        var playerTwoId = "user-2";

        await using var db = new AppDbContext(options);
        db.Games.Add(new Game
        {
            Id = gameId,
            Title = "Match Game",
            Slug = "match-game",
            CreatedByUserId = playerOneId,
            ApprovalStatus = GameApprovalStatus.Approved
        });
        db.Users.AddRange(
            new ApplicationUser { Id = playerOneId, UserName = "alpha", Email = "alpha@example.com" },
            new ApplicationUser { Id = playerTwoId, UserName = "beta", Email = "beta@example.com" }
        );
        db.MatchSessions.Add(new MatchSession
        {
            Id = sessionId,
            GameId = gameId,
            UserId = playerOneId,
            Used = true,
            Mode = GameMode.MultiplayerRealtime,
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-10),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-5)
        });
        db.SessionPlayers.AddRange(
            new SessionPlayer { SessionId = sessionId, UserId = playerOneId, Role = "host", JoinedAtUtc = DateTime.UtcNow },
            new SessionPlayer { SessionId = sessionId, UserId = playerTwoId, Role = "guest", JoinedAtUtc = DateTime.UtcNow }
        );
        db.Scores.AddRange(
            new Score
            {
                GameId = gameId,
                MatchSessionId = sessionId,
                UserId = playerOneId,
                Mode = GameMode.MultiplayerRealtime,
                Value = 10,
                SubmittedAtUtc = DateTime.UtcNow,
                Verified = true
            },
            new Score
            {
                GameId = gameId,
                MatchSessionId = sessionId,
                UserId = playerTwoId,
                Mode = GameMode.MultiplayerRealtime,
                Value = 5,
                SubmittedAtUtc = DateTime.UtcNow,
                Verified = true
            }
        );
        await db.SaveChangesAsync();

        var controller = new LeaderboardsController(db);
        var result = await controller.Get(gameId, top: 10, mode: null, limit: null);
        var ok = Assert.IsType<OkObjectResult>(result);
        var rows = Assert.IsAssignableFrom<IEnumerable<LeaderboardRowDto>>(ok.Value);
        var list = rows.ToList();

        Assert.Equal(2, list.Count);
        Assert.Equal(1, list[0].Wins);
        Assert.Equal(0, list[0].Losses);
        Assert.Equal(0, list[1].Wins);
        Assert.Equal(1, list[1].Losses);
        Assert.All(list, row => Assert.True(row.TotalMatches > 0, row.UserName));
    }

    private static void SeedBasicSession(AppDbContext db, Guid gameId, string userId, Guid sessionId, string tokenHash, DateTime expiresAtUtc)
    {
        db.Games.Add(new Game
        {
            Id = gameId,
            Title = "Test Game",
            Slug = "test-game",
            CreatedByUserId = userId,
            ApprovalStatus = GameApprovalStatus.Approved
        });
        db.Users.Add(new ApplicationUser
        {
            Id = userId,
            UserName = "player-one",
            Email = "player-one@example.com"
        });
        db.MatchSessions.Add(new MatchSession
        {
            Id = sessionId,
            GameId = gameId,
            UserId = userId,
            Mode = GameMode.MultiplayerRealtime,
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-10),
            ExpiresAtUtc = expiresAtUtc
        });
        db.SessionPlayers.Add(new SessionPlayer
        {
            SessionId = sessionId,
            UserId = userId,
            TokenHash = tokenHash,
            Role = "host",
            JoinedAtUtc = DateTime.UtcNow.AddMinutes(-10)
        });
    }

    private sealed class NullActivityLogger : IActivityLogger
    {
        public Task LogAsync(ActivityLogType type, string? actorUserId, Action<ActivityLog>? configure = null, CancellationToken cancellationToken = default)
        {
            return Task.CompletedTask;
        }
    }

    private sealed class TestStringLocalizer : IStringLocalizer<SharedResource>
    {
        public LocalizedString this[string name] => new(name, name, true, "Tests");

        public LocalizedString this[string name, params object[] arguments]
            => new(name, string.Format(CultureInfo.InvariantCulture, name, arguments), true, "Tests");

        public IEnumerable<LocalizedString> GetAllStrings(bool includeParentCultures)
        {
            return Array.Empty<LocalizedString>();
        }

        public IStringLocalizer WithCulture(CultureInfo culture)
        {
            return this;
        }
    }
}