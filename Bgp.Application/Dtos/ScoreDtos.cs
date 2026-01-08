using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Application.Dtos;

public record StartSessionResponse(Guid SessionId, string Token, DateTime ExpiresAtUtc);

public class SubmitScoreRequest
{
    [Required]
    public Guid SessionId { get; set; }
    public GameMode Mode { get; set; } = GameMode.Singleplayer;

    [Range(0, double.MaxValue)]
    public double Score { get; set; }

    [Required, MaxLength(256)]
    public string Signature { get; set; } = string.Empty; // HMAC(sessionId:score)
}

public record LeaderboardRowDto(
    string UserName,
    double BestScore,
    int TotalMatches,
    int RankPosition,
    int TotalPlayers,
    int ExperiencePoints);
