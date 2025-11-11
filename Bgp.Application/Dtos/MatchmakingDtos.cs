using System;

namespace Bgp.Application.Dtos;

public record MatchmakingTicketResponse(
    Guid TicketId,
    string Status,
    Guid? MatchId,
    string? OpponentUserId,
    string? OpponentDisplayName,
    DateTime ExpiresAtUtc,
    DateTime? MatchedAtUtc
);

public record MatchmakingRequest(int Mode);