using Microsoft.AspNetCore.Mvc;

namespace Bgp.Web.Controllers;

public class HomeController : Controller
{
    public IActionResult Index()
    {
        if (User?.Identity?.IsAuthenticated == true)
        {
            return RedirectToAction("Index", "Dashboard");
        }

        return RedirectToAction("Index", "Games");
    }
}
