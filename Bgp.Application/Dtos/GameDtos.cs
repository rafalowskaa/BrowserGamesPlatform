using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Application.Dtos;

public record GameListItemDto(Guid Id, string Title, string Slug, string? CoverImagePath, double AvgRating, int ReviewsCount, GameMode Modes);

public class CreateGameDto
{
    [Required, MaxLength(120)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public GameMode Modes { get; set; } = GameMode.Singleplayer;
}

public class CreateGameVersionDto
{
    [Required, MaxLength(32)]
    public string Version { get; set; } = "1.0.0";
    [MaxLength(1000)]
    public string? Changelog { get; set; }
}
