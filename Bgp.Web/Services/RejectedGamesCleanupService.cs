using System;
using System.Threading;
using System.Threading.Tasks;
using Bgp.Domain.Constants;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bgp.Web.Services;

public class RejectedGamesCleanupService : BackgroundService
{
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromHours(12);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RejectedGamesCleanupService> _logger;

    public RejectedGamesCleanupService(IServiceScopeFactory scopeFactory, ILogger<RejectedGamesCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(CleanupInterval);

        await CleanupAsync(stoppingToken);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await CleanupAsync(stoppingToken);
        }
    }

    private async Task CleanupAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var cutoff = DateTime.UtcNow - GameModerationSettings.RejectedRetentionPeriod;

            var expiredGames = await db.Games
                .Where(g => g.ApprovalStatus == GameApprovalStatus.Rejected
                            && g.RejectedAtUtc != null
                            && g.RejectedAtUtc <= cutoff)
                .ToListAsync(cancellationToken);

            if (expiredGames.Count == 0)
            {
                return;
            }

            db.Games.RemoveRange(expiredGames);
            await db.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Removed {Count} rejected games older than {RetentionDays} days.", expiredGames.Count, GameModerationSettings.RejectedRetentionPeriod.TotalDays);
        }
        catch (OperationCanceledException)
        {
            // Ignore cancellation.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clean up expired rejected games.");
        }
    }
}