using System.Security.Claims;
using Bgp.Application.Dtos;
using Bgp.Application.Interfaces;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Controllers.Api;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Tests;

public class GamePublishingTests
{
    [Fact]
    public async Task Create_Normalizes_Slug_And_Rejects_A_Duplicate()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"game-publishing-{Guid.NewGuid()}")
            .Options;

        await using var db = new AppDbContext(options);
        const string userId = "game-author";
        db.Users.Add(new ApplicationUser
        {
            Id = userId,
            UserName = userId,
            Email = "author@local.test"
        });
        await db.SaveChangesAsync();

        var controller = new GamesController(db, new UnexpectedFileStorage())
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

        var created = await controller.Create(
            new CreateGameDto { Title = "Super gra!!! 123" }, cover: null);

        Assert.IsType<CreatedAtActionResult>(created);
        var game = await db.Games.SingleAsync();
        Assert.Equal("super-gra-123", game.Slug);
        Assert.Equal("Super gra!!! 123", game.Title);
        Assert.Equal(userId, game.CreatedByUserId);
        Assert.Equal(GameApprovalStatus.Pending, game.ApprovalStatus);

        var duplicate = await controller.Create(
            new CreateGameDto { Title = "Super gra 123" }, cover: null);

        Assert.IsType<ConflictObjectResult>(duplicate);
        Assert.Equal(1, await db.Games.CountAsync());
    }

    private sealed class UnexpectedFileStorage : IFileStorage
    {
        public Task<string> SaveAsync(Stream content, string fileName, string subfolder, CancellationToken ct = default)
            => throw new InvalidOperationException("This request does not include a cover upload.");

        public Task ExtractZipAsync(Stream zipStream, string targetSubfolder, CancellationToken ct = default)
            => throw new InvalidOperationException("This request does not include a game package.");
    }
}
