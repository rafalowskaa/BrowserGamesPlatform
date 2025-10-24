using System.ComponentModel.DataAnnotations;
using Bgp.Infrastructure.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Bgp.Web.Controllers;

public class AccountController : Controller
{
    private readonly SignInManager<ApplicationUser> _signIn;
    private readonly UserManager<ApplicationUser> _users;

    public AccountController(SignInManager<ApplicationUser> signIn, UserManager<ApplicationUser> users)
    {
        _signIn = signIn;
        _users = users;
    }

    [AllowAnonymous]
    public IActionResult Login(string? returnUrl = null) => View(new LoginVm { ReturnUrl = returnUrl });

    [HttpPost, AllowAnonymous]
    public async Task<IActionResult> Login(LoginVm vm)
    {
        if (!ModelState.IsValid) return View(vm);
        var res = await _signIn.PasswordSignInAsync(vm.LoginOrEmail, vm.Password, vm.RememberMe, lockoutOnFailure: true);
        if (res.Succeeded) return LocalRedirect(vm.ReturnUrl ?? "/");
        ModelState.AddModelError("", "Invalid credentials.");
        return View(vm);
    }

    [AllowAnonymous]
    public IActionResult Register(string? returnUrl = null) => View(new RegisterVm { ReturnUrl = returnUrl });

    [HttpPost, AllowAnonymous]
    public async Task<IActionResult> Register(RegisterVm vm)
    {
        if (!ModelState.IsValid) return View(vm);

        var user = new ApplicationUser
        {
            UserName = vm.Login,
            Email = vm.Email,
            DisplayName = vm.Login,
            EmailConfirmed = true // DEV: w produkcji – wysyłka maila weryfikacyjnego
        };

        var result = await _users.CreateAsync(user, vm.Password);
        if (!result.Succeeded)
        {
            foreach (var e in result.Errors) ModelState.AddModelError("", e.Description);
            return View(vm);
        }

        await _signIn.SignInAsync(user, isPersistent: false);
        return LocalRedirect(vm.ReturnUrl ?? "/");
    }

    [HttpPost]
    public async Task<IActionResult> Logout(string? returnUrl = "/")
    {
        await _signIn.SignOutAsync();
        return LocalRedirect(returnUrl!);
    }
}

public class LoginVm
{
    [Required] public string LoginOrEmail { get; set; } = string.Empty;
    [Required] public string Password { get; set; } = string.Empty;
    public bool RememberMe { get; set; }
    public string? ReturnUrl { get; set; }
}

public class RegisterVm
{
    [Required] public string Login { get; set; } = string.Empty;
    [Required, EmailAddress] public string Email { get; set; } = string.Empty;
    [Required, MinLength(6)] public string Password { get; set; } = string.Empty;
    [Compare(nameof(Password))] public string ConfirmPassword { get; set; } = string.Empty;
    public string? ReturnUrl { get; set; }
}
