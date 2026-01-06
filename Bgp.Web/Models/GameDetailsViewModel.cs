using Bgp.Domain.Entities;

namespace Bgp.Web.Models;

public class GameDetailsViewModel
{
    public Game Game { get; init; } = default!;

    public GameLocale? Locale { get; init; }

    public IReadOnlyList<GamePlayOptionViewModel> PlayOptions { get; init; }
        = Array.Empty<GamePlayOptionViewModel>();

    public string DisplayTitle { get; init; } = string.Empty;
    public string? DisplayDescription { get; init; }
    public string? DisplayRules { get; init; }

    public string CurrentLocale { get; init; } = "en-US";
    public string DefaultLocale { get; init; } = "en-US";

    public string? BannerUrl { get; init; }
    public string? ThumbnailUrl { get; init; }
    public IReadOnlyList<string> GalleryUrls { get; init; } = Array.Empty<string>();
    public IReadOnlyList<GameAsset> Assets { get; init; } = Array.Empty<GameAsset>();

    public string? OwnerName { get; init; }
        = null;

    public double AverageRating { get; init; }
        = 0;

    public int ReviewCount { get; init; }
        = 0;

    public IReadOnlyDictionary<int, int> RatingDistribution { get; init; }
        = new Dictionary<int, int>();

    public int? UserRating { get; init; }
        = null;

    public int ActivePlayerCount { get; init; }
        = 0;
}

public record GamePlayOptionViewModel(
    string Kind,
    string Label,
    string Url,
    string? FileName,
    string? Description,
    int? NativeWidth = null,
    int? NativeHeight = null,
    double? AspectRatio = null);