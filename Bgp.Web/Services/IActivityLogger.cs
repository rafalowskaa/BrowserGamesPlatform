using System;
using Bgp.Domain.Entities;
using Bgp.Domain.Enums;

namespace Bgp.Web.Services;

public interface IActivityLogger
{
    Task LogAsync(ActivityLogType type, string? actorUserId, Action<ActivityLog>? configure = null, CancellationToken cancellationToken = default);
}

public class ActivityLogger : IActivityLogger
{
    private readonly Bgp.Infrastructure.Persistence.AppDbContext _db;

    public ActivityLogger(Bgp.Infrastructure.Persistence.AppDbContext db)
    {
        _db = db;
    }

    public async Task LogAsync(ActivityLogType type, string? actorUserId, Action<ActivityLog>? configure = null, CancellationToken cancellationToken = default)
    {
        var log = new ActivityLog
        {
            Type = type,
            ActorUserId = actorUserId,
            CreatedAtUtc = DateTime.UtcNow
        };
        configure?.Invoke(log);
        _db.ActivityLogs.Add(log);
        await _db.SaveChangesAsync(cancellationToken);
    }
}