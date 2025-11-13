using System.Globalization;
using Bgp.Infrastructure.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Localization;

namespace Bgp.Web.Middleware;

public class UserPreferenceMiddleware
{
    private const string ThemeCookieName = "bgp-theme";
    private const string ThemeItemKey = "PreferredTheme";

    private readonly RequestDelegate _next;

    public UserPreferenceMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, UserManager<ApplicationUser> userManager)
    {
        if (context.User?.Identity?.IsAuthenticated == true)
        {
            var user = await userManager.GetUserAsync(context.User);
            if (user is not null)
            {
                ApplyLanguagePreference(context, user.PreferredLanguage);
                ApplyThemePreference(context, user.PreferredTheme);
            }
        }

        await _next(context);
    }

    private static void ApplyLanguagePreference(HttpContext context, string? preference)
    {
        var cultureName = NormalizeLanguage(preference);
        if (cultureName is null)
        {
            context.Response.Cookies.Delete(CookieRequestCultureProvider.DefaultCookieName);
            return;
        }

        var culture = CultureInfo.GetCultureInfo(cultureName);
        CultureInfo.CurrentCulture = culture;
        CultureInfo.CurrentUICulture = culture;

        context.Items[nameof(CultureInfo)] = culture;
        context.Response.Cookies.Append(
            CookieRequestCultureProvider.DefaultCookieName,
            CookieRequestCultureProvider.MakeCookieValue(new RequestCulture(culture)),
            new CookieOptions
            {
                IsEssential = true,
                Expires = DateTimeOffset.UtcNow.AddYears(1)
            });
    }

    private static void ApplyThemePreference(HttpContext context, string? preference)
    {
        var theme = NormalizeTheme(preference);
        if (string.IsNullOrEmpty(theme))
        {
            context.Items.Remove(ThemeItemKey);
            context.Response.Cookies.Delete(ThemeCookieName);
            return;
        }

        context.Items[ThemeItemKey] = theme;
        context.Response.Cookies.Append(ThemeCookieName, theme, new CookieOptions
        {
            IsEssential = true,
            Expires = DateTimeOffset.UtcNow.AddYears(1)
        });
    }

    private static string? NormalizeLanguage(string? preference)
    {
        if (string.IsNullOrWhiteSpace(preference))
        {
            return null;
        }

        return preference.Trim().ToLowerInvariant() switch
        {
            "pl" or "pl-pl" => "pl-PL",
            "en" or "en-us" => "en-US",
            _ => null
        };
    }

    private static string? NormalizeTheme(string? preference)
    {
        if (string.IsNullOrWhiteSpace(preference))
        {
            return null;
        }

        return preference.Trim().ToLowerInvariant() switch
        {
            "light" => "light",
            "dark" => "dark",
            "contrast" => "contrast",
            _ => null
        };
    }
}