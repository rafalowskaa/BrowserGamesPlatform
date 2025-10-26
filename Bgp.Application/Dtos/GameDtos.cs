using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;
using System.Collections.Generic;

namespace Bgp.Application.Dtos;

public record GameListItemDto(Guid Id, string Title, string Slug, string? CoverImagePath, double AvgRating, int ReviewsCount, GameMode Modes, GameCategory Categories, IReadOnlyList<string> Tags);

public class CreateGameDto
{
    [Required, MaxLength(120)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public ICollection<GameMode> Modes { get; set; } = new List<GameMode>();

    public ICollection<GameCategory> Categories { get; set; } = new List<GameCategory>();

    public ICollection<string>? Tags { get; set; }
}

public class CreateGameVersionDto
{
    [Required, MaxLength(32)]
    public string Version { get; set; } = "1.0.0";
    [MaxLength(1000)]
    public string? Changelog { get; set; }
}
