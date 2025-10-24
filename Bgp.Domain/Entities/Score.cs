using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Domain.Entities;

public class Score
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid GameId { get; set; }
    public Game Game { get; set; } = default!;

    [Required]
    public string UserId { get; set; } = string.Empty;

    public GameMode Mode { get; set; } = GameMode.Singleplayer;

    // wartości rosnące = lepszy wynik (umownie)
    public double Value { get; set; }

    public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;

    // sesja zabezpieczająca (anty-cheat, HMAC)
    public Guid MatchSessionId { get; set; }
    public bool Verified { get; set; }
}
