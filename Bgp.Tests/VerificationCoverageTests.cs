using System.Globalization;
using System.Security.Claims;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Application.Interfaces;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Controllers;
using Bgp.Web.Controllers.Api;
using Bgp.Web.Helpers;
using Bgp.Web.Models;
using Bgp.Web.Resources;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Localization;

namespace Bgp.Tests;

public class VerificationCoverageTests
{
    [Fact]
    public void SessionToken_Hash_Is_Deterministic_And_NotRawToken()
    {
        var token = SessionTokenUtilities.GenerateToken();

        var firstHash = SessionTokenUtilities.HashToken(token);
        var secondHash = SessionTokenUtilities.HashToken(token);

        Assert.Equal(firstHash, secondHash);
        Assert.NotEqual(token, firstHash);
        Assert.Matches("^[0-9A-F]+$", firstHash);
    }

    [Fact]
    public async Task SubmitScore_Invalid_Outcome_Returns_BadRequest()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"invalid-outcome-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        var userId = "user-1";
        var sessionId = Guid.NewGuid();
        var token = SessionTokenUtilities.GenerateToken();
        var tokenHash = SessionTokenUtilities.HashToken(token);

        await using var db = new AppDbContext(options);
        SeedSession(db, gameId, userId, sessionId, tokenHash);
        await db.SaveChangesAsync();

        var controller = new GameSessionsController(db, new TestStringLocalizer(), new NullActivityLogger());
        var result = await controller.SubmitScore(gameId, sessionId, new GameSessionsController.SubmitSessionScoreRequest
        {
            Token = token,
            Value = 15,
            Outcome = "victory"
        });

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(0, await db.Scores.CountAsync());
    }

    [Fact]
    public async Task SubmitScore_NonFinite_Value_Returns_BadRequest()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"non-finite-score-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        var userId = "user-1";
        var sessionId = Guid.NewGuid();
        var token = SessionTokenUtilities.GenerateToken();
        var tokenHash = SessionTokenUtilities.HashToken(token);

        await using var db = new AppDbContext(options);
        SeedSession(db, gameId, userId, sessionId, tokenHash);
        await db.SaveChangesAsync();

        var controller = new GameSessionsController(db, new TestStringLocalizer(), new NullActivityLogger());
        var result = await controller.SubmitScore(gameId, sessionId, new GameSessionsController.SubmitSessionScoreRequest
        {
            Token = token,
            Value = double.NaN,
            Outcome = "win"
        });

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(0, await db.Scores.CountAsync());
    }

    [Fact]
    public async Task Comment_Post_Within_Cooldown_Returns_429()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"comment-cooldown-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        var userId = "user-1";

        await using var db = new AppDbContext(options);
        db.Games.Add(new Game
        {
            Id = gameId,
            Title = "Cooldown Game",
            Slug = "cooldown-game",
            CreatedByUserId = userId,
            ApprovalStatus = GameApprovalStatus.Approved
        });
        db.Users.Add(new ApplicationUser
        {
            Id = userId,
            UserName = "commenter",
            Email = "commenter@example.com"
        });
        db.GameReviews.Add(new GameReview
        {
            GameId = gameId,
            UserId = userId,
            Stars = 0,
            Comment = "pierwszy",
            IsRating = false,
            CreatedAtUtc = DateTime.UtcNow.AddSeconds(-10)
        });
        await db.SaveChangesAsync();

        var controller = CreateCommentsController(db, userId);
        var result = await controller.Post(gameId, new GameCommentsController.CommentRequest
        {
            Text = "drugi za szybko"
        });

        var objectResult = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status429TooManyRequests, objectResult.StatusCode);
    }

    [Fact]
    public async Task Export_Csv_Contains_Header_And_BestScore_Order()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"leaderboard-export-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();

        await using var db = new AppDbContext(options);
        db.Games.Add(new Game
        {
            Id = gameId,
            Title = "Export Game",
            Slug = "export-game",
            CreatedByUserId = "u1",
            ApprovalStatus = GameApprovalStatus.Approved
        });
        db.Users.AddRange(
            new ApplicationUser { Id = "u1", UserName = "alpha", Email = "alpha@example.com" },
            new ApplicationUser { Id = "u2", UserName = "beta", Email = "beta@example.com" });
        db.MatchSessions.Add(new MatchSession
        {
            Id = sessionId,
            GameId = gameId,
            UserId = "u1",
            Mode = GameMode.MultiplayerRealtime,
            Used = true,
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-10),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-5)
        });
        db.Scores.AddRange(
            new Score { GameId = gameId, MatchSessionId = sessionId, UserId = "u1", Value = 20, Verified = true, SubmittedAtUtc = DateTime.UtcNow },
            new Score { GameId = gameId, MatchSessionId = sessionId, UserId = "u2", Value = 10, Verified = true, SubmittedAtUtc = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var controller = new LeaderboardsController(db);
        var fileResult = Assert.IsType<FileContentResult>(await controller.Export(gameId, top: 10));
        var csv = System.Text.Encoding.UTF8.GetString(fileResult.FileContents);

        Assert.StartsWith("UserName,BestScore", csv.TrimStart());
        var rows = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Assert.Equal(3, rows.Length);
        Assert.Contains(",20", rows[1]);
    }

    [Fact]
    public async Task ApproveGame_Changes_Status_From_Pending_To_Approved()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"approve-game-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        await using var db = new AppDbContext(options);
        db.Games.Add(new Game
        {
            Id = gameId,
            Title = "Pending Game",
            Slug = "pending-game",
            CreatedByUserId = "owner",
            ApprovalStatus = GameApprovalStatus.Pending,
            ModerationNotes = "review this"
        });
        await db.SaveChangesAsync();

        var controller = CreateAdminUiController(db);
        var result = await controller.ApproveGame(gameId);

        Assert.IsType<RedirectToActionResult>(result);
        var updated = await db.Games.SingleAsync(g => g.Id == gameId);
        Assert.Equal(GameApprovalStatus.Approved, updated.ApprovalStatus);
        Assert.NotNull(updated.ApprovedAtUtc);
        Assert.Null(updated.RejectedAtUtc);
        Assert.Null(updated.ModerationNotes);
    }

    [Fact]
    public async Task RejectGame_Changes_Status_From_Pending_To_Rejected()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"reject-game-{Guid.NewGuid()}")
            .Options;

        var gameId = Guid.NewGuid();
        await using var db = new AppDbContext(options);
        db.Games.Add(new Game
        {
            Id = gameId,
            Title = "Pending Game",
            Slug = "pending-game",
            CreatedByUserId = "owner",
            ApprovalStatus = GameApprovalStatus.Pending,
            ApprovedAtUtc = DateTime.UtcNow.AddHours(-1)
        });
        await db.SaveChangesAsync();

        var controller = CreateAdminUiController(db);
        var result = await controller.RejectGame(new AdminRejectGameInputModel
        {
            Id = gameId,
            Notes = "Not ready"
        });

        Assert.IsType<RedirectToActionResult>(result);
        var updated = await db.Games.SingleAsync(g => g.Id == gameId);
        Assert.Equal(GameApprovalStatus.Rejected, updated.ApprovalStatus);
        Assert.Null(updated.ApprovedAtUtc);
        Assert.NotNull(updated.RejectedAtUtc);
        Assert.Equal("Not ready", updated.ModerationNotes);
    }

    [Fact]
    public void Moderation_Endpoints_Are_Restricted_To_Admin_And_Moderator_Roles()
    {
        var classAuthorize = typeof(AdminUiController)
            .GetCustomAttributes(typeof(Microsoft.AspNetCore.Authorization.AuthorizeAttribute), inherit: true)
            .Cast<Microsoft.AspNetCore.Authorization.AuthorizeAttribute>()
            .Single();

        Assert.Equal("Admin,Moderator", classAuthorize.Roles);

        var approveMethod = typeof(AdminUiController).GetMethod(nameof(AdminUiController.ApproveGame));
        Assert.NotNull(approveMethod);
        var overrideAuthorize = approveMethod!
            .GetCustomAttributes(typeof(Microsoft.AspNetCore.Authorization.AuthorizeAttribute), inherit: true)
            .Cast<Microsoft.AspNetCore.Authorization.AuthorizeAttribute>()
            .ToList();
        Assert.Empty(overrideAuthorize);
    }

    [Fact]
    public async Task GamesCatalog_Index_Applies_Filters_And_Only_Returns_Approved_Games()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"catalog-filters-{Guid.NewGuid()}")
            .Options;

        await using var db = new AppDbContext(options);
        db.Games.AddRange(
            new Game
            {
                Id = Guid.NewGuid(),
                Title = "Space Duel",
                Slug = "space-duel",
                Description = "fast arcade arena",
                CreatedByUserId = "owner",
                Categories = GameCategory.Arcade,
                ApprovalStatus = GameApprovalStatus.Approved,
                Tags = new List<GameTag> { new() { Value = "arcade", IsApproved = true, AddedByUserId = "owner" } }
            },
            new Game
            {
                Id = Guid.NewGuid(),
                Title = "Space Draft",
                Slug = "space-draft",
                Description = "card strategy",
                CreatedByUserId = "owner",
                Categories = GameCategory.Card,
                ApprovalStatus = GameApprovalStatus.Approved,
                Tags = new List<GameTag> { new() { Value = "cards", IsApproved = true, AddedByUserId = "owner" } }
            },
            new Game
            {
                Id = Guid.NewGuid(),
                Title = "Space Duel Hidden",
                Slug = "space-duel-hidden",
                Description = "should not leak",
                CreatedByUserId = "owner",
                Categories = GameCategory.Arcade,
                ApprovalStatus = GameApprovalStatus.Pending,
                Tags = new List<GameTag> { new() { Value = "arcade", IsApproved = true, AddedByUserId = "owner" } }
            });
        await db.SaveChangesAsync();

        var controller = new Bgp.Web.Controllers.GamesController(db, new TestStringLocalizer(), new StubGameContentResolver(), new NullActivityLogger());
        var result = await controller.Index(search: "Space", category: "Arcade", tag: "arcade");

        var view = Assert.IsType<ViewResult>(result);
        var model = Assert.IsType<GameCatalogViewModel>(view.Model);
        Assert.Single(model.Games);
        Assert.Equal("space-duel", model.Games[0].Slug);
    }

    [Fact]
    public async Task GamesCatalog_Index_Does_Not_Leak_Pending_Games_Without_Filters()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"catalog-approved-only-{Guid.NewGuid()}")
            .Options;

        await using var db = new AppDbContext(options);
        db.Games.AddRange(
            new Game
            {
                Id = Guid.NewGuid(),
                Title = "Public",
                Slug = "public",
                CreatedByUserId = "owner",
                ApprovalStatus = GameApprovalStatus.Approved
            },
            new Game
            {
                Id = Guid.NewGuid(),
                Title = "Pending",
                Slug = "pending",
                CreatedByUserId = "owner",
                ApprovalStatus = GameApprovalStatus.Pending
            });
        await db.SaveChangesAsync();

        var controller = new Bgp.Web.Controllers.GamesController(db, new TestStringLocalizer(), new StubGameContentResolver(), new NullActivityLogger());
        var result = await controller.Index();

        var view = Assert.IsType<ViewResult>(result);
        var model = Assert.IsType<GameCatalogViewModel>(view.Model);
        Assert.Single(model.Games);
        Assert.Equal("public", model.Games[0].Slug);
    }

    private static GameCommentsController CreateCommentsController(AppDbContext db, string userId)
    {
        var controller = new GameCommentsController(db, new TestStringLocalizer(), new NullActivityLogger())
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.NameIdentifier, userId)],
                    authenticationType: "TestAuth"))
                }
            }
        };

        return controller;
    }

    private static AdminUiController CreateAdminUiController(AppDbContext db)
    {
        var controller = new AdminUiController(
            db,
            users: null!,
            logger: null!,
            contentResolver: new StubGameContentResolver(),
            fileStorage: new StubFileStorage(),
            activityLogger: new NullActivityLogger(),
            localizer: new TestStringLocalizer(),
            environment: new StubWebHostEnvironment())
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
            TempData = new TempDataDictionary(new DefaultHttpContext(), new TestTempDataProvider())
        };

        return controller;
    }

    private static void SeedSession(AppDbContext db, Guid gameId, string userId, Guid sessionId, string tokenHash)
    {
        db.Games.Add(new Game
        {
            Id = gameId,
            Title = "Session Game",
            Slug = "session-game",
            CreatedByUserId = userId,
            ApprovalStatus = GameApprovalStatus.Approved
        });
        db.Users.Add(new ApplicationUser
        {
            Id = userId,
            UserName = "player",
            Email = "player@example.com"
        });
        db.MatchSessions.Add(new MatchSession
        {
            Id = sessionId,
            GameId = gameId,
            UserId = userId,
            Mode = GameMode.MultiplayerRealtime,
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-5),
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(20)
        });
        db.SessionPlayers.Add(new SessionPlayer
        {
            SessionId = sessionId,
            UserId = userId,
            TokenHash = tokenHash,
            Role = "host",
            JoinedAtUtc = DateTime.UtcNow.AddMinutes(-5)
        });
    }

    private sealed class NullActivityLogger : IActivityLogger
    {
        public Task LogAsync(ActivityLogType type, string? actorUserId, Action<ActivityLog>? configure = null, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class StubGameContentResolver : IGameContentResolver
    {
        public IReadOnlyList<GamePlayOptionViewModel> Resolve(string? contentPath)
            => Array.Empty<GamePlayOptionViewModel>();
    }

    private sealed class StubFileStorage : IFileStorage
    {
        public Task<string> SaveAsync(Stream stream, string fileName, string folder, CancellationToken ct = default)
            => Task.FromResult($"/{folder}/{fileName}");

        public Task ExtractZipAsync(Stream zipStream, string targetSubfolder, CancellationToken ct = default)
            => Task.CompletedTask;
    }

    private sealed class StubWebHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Tests";
        public IFileProvider WebRootFileProvider { get; set; } = null!;
        public string WebRootPath { get; set; } = string.Empty;
        public string EnvironmentName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }

    private sealed class TestTempDataProvider : ITempDataProvider
    {
        public IDictionary<string, object> LoadTempData(HttpContext context) => new Dictionary<string, object>();

        public void SaveTempData(HttpContext context, IDictionary<string, object> values)
        {
        }
    }

    private sealed class TestStringLocalizer : IStringLocalizer<SharedResource>
    {
        public LocalizedString this[string name] => new(name, name, true, "Tests");

        public LocalizedString this[string name, params object[] arguments]
            => new(name, string.Format(CultureInfo.InvariantCulture, name, arguments), true, "Tests");

        public IEnumerable<LocalizedString> GetAllStrings(bool includeParentCultures) => Array.Empty<LocalizedString>();

        public IStringLocalizer WithCulture(CultureInfo culture) => this;
    }
}