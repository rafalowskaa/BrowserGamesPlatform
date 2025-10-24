using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.Mvc;

namespace Bgp.Web.Controllers;

public class LanguageController : Controller
{
    [HttpGet("/lang/set")]
    public IActionResult Set(string culture = "pl-PL", string? returnUrl = "/")
    {
        Response.Cookies.Append(
            CookieRequestCultureProvider.DefaultCookieName,
            CookieRequestCultureProvider.MakeCookieValue(new RequestCulture(culture)),
            new CookieOptions { Expires = DateTimeOffset.UtcNow.AddYears(1) });

        return LocalRedirect(returnUrl ?? "/");
    }
}
