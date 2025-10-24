using Microsoft.AspNetCore.Mvc;

namespace Bgp.Web.Controllers;

public class HomeController : Controller
{
    public IActionResult Index() => View();
}
