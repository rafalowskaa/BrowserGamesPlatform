using Bgp.Domain.Entities;
using Bgp.Domain.Enums;

namespace Bgp.Web.Helpers;

public static class GameLocalizationExtensions
{
    public static GameLocale? ResolveLocale(this Game game, string? requestedLocale)
    {
        if (game is null)
        {
            return null;
        }

        var locales = game.Locales;
        if (locales is null || locales.Count == 0)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(requestedLocale))
        {
            var match = locales.FirstOrDefault(l => string.Equals(l.Locale, requestedLocale, StringComparison.OrdinalIgnoreCase));
            if (match is not null)
            {
                return match;
            }
        }

        if (!string.IsNullOrWhiteSpace(game.DefaultLocale))
        {
            var fallback = locales.FirstOrDefault(l => string.Equals(l.Locale, game.DefaultLocale, StringComparison.OrdinalIgnoreCase));
            if (fallback is not null)
            {
                return fallback;
            }
        }

        return locales.FirstOrDefault();
    }

    public static string? ResolveAsset(this Game game, GameAssetType type, string? locale)
    {
        if (game is null || game.Assets is null || game.Assets.Count == 0)
        {
            return null;
        }

        var ordered = game.Assets
            .Where(a => a.Type == type)
            .OrderBy(a => a.SortOrder)
            .ToList();

        if (ordered.Count == 0)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(locale))
        {
            var localized = ordered.FirstOrDefault(a => string.Equals(a.Locale, locale, StringComparison.OrdinalIgnoreCase));
            if (localized is not null)
            {
                return localized.Url;
            }
        }

        if (!string.IsNullOrWhiteSpace(game.DefaultLocale))
        {
            var fallback = ordered.FirstOrDefault(a => string.Equals(a.Locale, game.DefaultLocale, StringComparison.OrdinalIgnoreCase));
            if (fallback is not null)
            {
                return fallback.Url;
            }
        }

        var neutral = ordered.FirstOrDefault(a => string.IsNullOrWhiteSpace(a.Locale));
        return neutral?.Url ?? ordered.First().Url;
    }

    public static IReadOnlyList<string> ResolveGallery(this Game game, string? locale)
    {
        if (game is null || game.Assets is null)
        {
            return Array.Empty<string>();
        }

        var gallery = game.Assets
            .Where(a => a.Type == GameAssetType.Gallery)
            .OrderBy(a => a.SortOrder)
            .ToList();

        if (gallery.Count == 0)
        {
            return Array.Empty<string>();
        }

        if (!string.IsNullOrWhiteSpace(locale))
        {
            var localized = gallery.Where(a => string.Equals(a.Locale, locale, StringComparison.OrdinalIgnoreCase)).ToList();
            if (localized.Count > 0)
            {
                return localized.Select(a => a.Url).ToList();
            }
        }

        if (!string.IsNullOrWhiteSpace(game.DefaultLocale))
        {
            var fallback = gallery.Where(a => string.Equals(a.Locale, game.DefaultLocale, StringComparison.OrdinalIgnoreCase)).ToList();
            if (fallback.Count > 0)
            {
                return fallback.Select(a => a.Url).ToList();
            }
        }

        var neutral = gallery.Where(a => string.IsNullOrWhiteSpace(a.Locale)).ToList();
        if (neutral.Count > 0)
        {
            return neutral.Select(a => a.Url).ToList();
        }

        return gallery.Select(a => a.Url).ToList();
    }
}