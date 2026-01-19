using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc.Rendering;
using Bgp.Domain.Enums;

namespace Bgp.Web.Models;

public class GameCatalogViewModel
{
    public IReadOnlyList<GameCatalogItemViewModel> Games { get; init; } = new List<GameCatalogItemViewModel>();
    public GameCatalogFilterModel Filters { get; init; } = new();
    public IReadOnlyList<SelectListItem> CategoryOptions { get; init; } = new List<SelectListItem>();
    public IReadOnlyList<SelectListItem> TagOptions { get; init; } = new List<SelectListItem>();
}

public record GameCatalogItemViewModel(
    Guid Id,
    string Title,
    string Slug,
    string? CoverImagePath,
    double AverageRating,
    GameMode Modes,
    GameCategory Categories,
    IReadOnlyList<string> Tags,
    string? Description,
    int ActivePlayerCount);

public class GameCatalogFilterModel
{
    public string? Search { get; set; }
    public string? Category { get; set; }
    public string? Tag { get; set; }
}