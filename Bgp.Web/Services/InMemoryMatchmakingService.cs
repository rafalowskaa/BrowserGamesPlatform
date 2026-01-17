using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using Bgp.Application.Interfaces;
using Bgp.Domain.Enums;

namespace Bgp.Web.Services;

public interface IMatchmakingService
{
    Task<MatchTicket> EnqueueAsync(Guid gameId, string userId, GameMode mode, CancellationToken cancellationToken = default);
    Task<MatchTicket?> GetAsync(Guid ticketId, CancellationToken cancellationToken = default);
    Task<bool> CancelAsync(Guid ticketId, string userId, CancellationToken cancellationToken = default);
}

public sealed class InMemoryMatchmakingService : IMatchmakingService
{
    private readonly ConcurrentDictionary<Guid, MatchTicket> _tickets = new();
    private readonly ConcurrentDictionary<(Guid GameId, GameMode Mode), Queue<Guid>> _queues = new();
    private readonly ConcurrentDictionary<(Guid GameId, GameMode Mode), object> _locks = new();
    private readonly IDateTimeProvider _clock;

    private static readonly TimeSpan TicketTtl = TimeSpan.FromMinutes(5);

    public InMemoryMatchmakingService(IDateTimeProvider clock)
    {
        _clock = clock;
    }

    public Task<MatchTicket> EnqueueAsync(Guid gameId, string userId, GameMode mode, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var now = _clock.UtcNow;
        var ticket = new MatchTicket
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            UserId = userId,
            Mode = mode,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.Add(TicketTtl)
        };

        _tickets[ticket.Id] = ticket;

        var key = (gameId, mode);
        var queue = _queues.GetOrAdd(key, _ => new Queue<Guid>());
        var sync = _locks.GetOrAdd(key, _ => new object());

        lock (sync)
        {
            CleanupQueue(queue, now);

            while (queue.Count > 0)
            {
                var candidateId = queue.Dequeue();
                if (!_tickets.TryGetValue(candidateId, out var candidate))
                {
                    continue;
                }

                if (candidate.IsInactive(now) || string.Equals(candidate.UserId, userId, StringComparison.Ordinal))
                {
                    continue;
                }

                var matchId = Guid.NewGuid();
                candidate.MatchId = matchId;
                candidate.MatchedAtUtc = now;
                candidate.OpponentUserId = userId;
                _tickets[candidate.Id] = candidate;

                ticket.MatchId = matchId;
                ticket.MatchedAtUtc = now;
                ticket.OpponentUserId = candidate.UserId;
                return Task.FromResult(ticket);
            }

            queue.Enqueue(ticket.Id);
        }

        return Task.FromResult(ticket);
    }

    public Task<MatchTicket?> GetAsync(Guid ticketId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!_tickets.TryGetValue(ticketId, out var ticket))
        {
            return Task.FromResult<MatchTicket?>(null);
        }

        var now = _clock.UtcNow;
        if (ticket.IsInactive(now))
        {
            ticket.Cancel(now);
            _tickets[ticket.Id] = ticket;
        }

        return Task.FromResult<MatchTicket?>(ticket);
    }

    public Task<bool> CancelAsync(Guid ticketId, string userId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!_tickets.TryGetValue(ticketId, out var ticket))
        {
            return Task.FromResult(false);
        }

        if (!string.Equals(ticket.UserId, userId, StringComparison.Ordinal))
        {
            return Task.FromResult(false);
        }

        var now = _clock.UtcNow;
        ticket.Cancel(now);
        _tickets[ticket.Id] = ticket;

        var key = (ticket.GameId, ticket.Mode);
        if (_queues.TryGetValue(key, out var queue))
        {
            var sync = _locks.GetOrAdd(key, _ => new object());
            lock (sync)
            {
                var remaining = new Queue<Guid>(queue.Count);
                while (queue.Count > 0)
                {
                    var candidateId = queue.Dequeue();
                    if (candidateId == ticketId)
                    {
                        continue;
                    }

                    if (_tickets.TryGetValue(candidateId, out var candidate) && !candidate.IsInactive(now))
                    {
                        remaining.Enqueue(candidateId);
                    }
                }

                while (remaining.Count > 0)
                {
                    queue.Enqueue(remaining.Dequeue());
                }
            }
        }

        return Task.FromResult(true);
    }

    private void CleanupQueue(Queue<Guid> queue, DateTime now)
    {
        if (queue.Count == 0)
        {
            return;
        }

        var originalCount = queue.Count;
        for (var i = 0; i < originalCount; i++)
        {
            var ticketId = queue.Dequeue();
            if (_tickets.TryGetValue(ticketId, out var ticket) && !ticket.IsInactive(now))
            {
                queue.Enqueue(ticketId);
            }
        }
    }
}

public sealed class MatchTicket
{
    public Guid Id { get; init; }
    public Guid GameId { get; init; }
    public string UserId { get; init; } = string.Empty;
    public GameMode Mode { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime ExpiresAtUtc { get; init; }
    public Guid? MatchId { get; set; }
    public string? OpponentUserId { get; set; }
    public DateTime? MatchedAtUtc { get; set; }
    public bool Cancelled { get; private set; }
    public DateTime? CancelledAtUtc { get; private set; }

    public void Cancel(DateTime now)
    {
        Cancelled = true;
        CancelledAtUtc = now;
    }

    public bool IsInactive(DateTime now)
    {
        if (Cancelled)
        {
            return true;
        }

        if (MatchId.HasValue)
        {
            return false;
        }

        return now >= ExpiresAtUtc;
    }
}