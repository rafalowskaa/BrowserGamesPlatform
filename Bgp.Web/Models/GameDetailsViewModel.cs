using Bgp.Domain.Entities;

namespace Bgp.Web.Models;

public class GameDetailsViewModel
{
    public Game Game { get; init; } = default!;

    public IReadOnlyList<GamePlayOptionViewModel> PlayOptions { get; init; }
        = Array.Empty<GamePlayOptionViewModel>();

    public string? OwnerName { get; init; }
        = null;

    public string? LeaderboardDownloadUrl { get; init; }
        = null;
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