using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Domain.Entities;

public class GameAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid GameId { get; set; }
    public Game Game { get; set; } = default!;

    [Required]
    public GameAssetType Type { get; set; }

    [MaxLength(512)]
    public string? Locale { get; set; }

    [Required, MaxLength(1024)]
    public string Url { get; set; } = string.Empty;

    public int SortOrder { get; set; } = 0;
}