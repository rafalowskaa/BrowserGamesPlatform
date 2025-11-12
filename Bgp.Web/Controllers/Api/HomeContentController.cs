using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Bgp.Web.Services;
using Bgp.Web.ViewModels;
using Microsoft.AspNetCore.Mvc;

namespace Bgp.Web.Controllers.Api;

[ApiController]
[Route("api/home")]
public class HomeContentController : ControllerBase
{
    private const int DefaultLimit = 8;
    private const int MaxLimit = 24;
    private readonly HomeContentService _homeContentService;

    public HomeContentController(HomeContentService homeContentService)
    {
        _homeContentService = homeContentService;
    }

    [HttpGet("featured")]
    public async Task<ActionResult<IReadOnlyList<GameSummaryViewModel>>> GetFeatured([FromQuery] int? limit, CancellationToken cancellationToken)
    {
        var size = NormalizeLimit(limit);
        var games = await _homeContentService.GetFeaturedAsync(size, cancellationToken);
        return Ok(games);
    }

    [HttpGet("trending")]
    public async Task<ActionResult<IReadOnlyList<GameSummaryViewModel>>> GetTrending([FromQuery] int? limit, [FromQuery] string? tag, CancellationToken cancellationToken)
    {
        var size = NormalizeLimit(limit);
        var games = await _homeContentService.GetTrendingAsync(size, tag, cancellationToken);
        return Ok(games);
    }

    [HttpGet("tags")]
    public async Task<ActionResult<IReadOnlyList<TagFilterViewModel>>> GetTags([FromQuery] int? limit, CancellationToken cancellationToken)
    {
        var size = NormalizeLimit(limit);
        var tags = await _homeContentService.GetTopTagsAsync(size, cancellationToken);
        return Ok(tags);
    }

    private static int NormalizeLimit(int? limit)
    {
        if (!limit.HasValue)
        {
            return DefaultLimit;
        }

        var value = Math.Clamp(limit.Value, 1, MaxLimit);
        return value;
    }
}