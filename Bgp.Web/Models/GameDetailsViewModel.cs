using Bgp.Domain.Entities;

namespace Bgp.Web.Models;

public class GameDetailsViewModel
{
    public Game Game { get; init; } = default!;

    public IReadOnlyList<GamePlayOptionViewModel> PlayOptions { get; init; }
        = Array.Empty<GamePlayOptionViewModel>();

    public string? OwnerName { get; init; }
        = null;

    public double AverageRating { get; init; }
        = 0;

    public int ReviewCount { get; init; }
        = 0;

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