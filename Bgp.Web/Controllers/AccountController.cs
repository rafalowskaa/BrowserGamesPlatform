using System.ComponentModel.DataAnnotations;
using Bgp.Infrastructure.Identity;
using Bgp.Web.Resources;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.Controllers;

public class AccountController : Controller
{
    private readonly SignInManager<ApplicationUser> _signIn;
    private readonly UserManager<ApplicationUser> _users;
    private readonly IStringLocalizer<SharedResource> _localizer;

    public AccountController(SignInManager<ApplicationUser> signIn, UserManager<ApplicationUser> users, IStringLocalizer<SharedResource> localizer)
    {
        _signIn = signIn;
        _users = users;
        _localizer = localizer;
    }

    [AllowAnonymous]
    public IActionResult Login(string? returnUrl = null) => View(new LoginVm { ReturnUrl = returnUrl });

    [HttpPost, AllowAnonymous, ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(LoginVm vm)
    {
        if (!ModelState.IsValid) return View(vm);
        var identifier = vm.LoginOrEmail.Trim();
        vm.LoginOrEmail = identifier;

        if (string.IsNullOrWhiteSpace(identifier) || string.IsNullOrWhiteSpace(vm.Password))
        {
            ModelState.AddModelError(string.Empty, _localizer["Account_InvalidCredentials"]);
            return View(vm);
        }

        var userName = identifier;
        if (identifier.Contains('@'))
        {
            var byEmail = await _users.FindByEmailAsync(identifier);
            if (byEmail is not null)
            {
                userName = byEmail.UserName ?? byEmail.Email ?? identifier;
            }
        }

        var res = await _signIn.PasswordSignInAsync(userName, vm.Password, vm.RememberMe, lockoutOnFailure: true);
        if (res.Succeeded)
        {
            var target = vm.ReturnUrl;
            if (string.IsNullOrWhiteSpace(target))
            {
                target = Url.Action("Index", "Dashboard") ?? "/";
            }

            return LocalRedirect(target);
        }
        if (res.IsLockedOut)
        {
            ModelState.AddModelError(string.Empty, _localizer["Account_LockedOut"]);
        }
        else
        {
            ModelState.AddModelError(string.Empty, _localizer["Account_InvalidCredentials"]);
        }
        return View(vm);
    }

    [AllowAnonymous]
    public IActionResult Register(string? returnUrl = null) => View(new RegisterVm { ReturnUrl = returnUrl });

    [HttpPost, AllowAnonymous, ValidateAntiForgeryToken]
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

        var roleResult = await _users.AddToRoleAsync(user, "User");
        if (!roleResult.Succeeded)
        {
            foreach (var e in roleResult.Errors) ModelState.AddModelError("", e.Description);
            return View(vm);
        }

        await _signIn.SignInAsync(user, isPersistent: false);
        var target = vm.ReturnUrl;
        if (string.IsNullOrWhiteSpace(target))
        {
            target = Url.Action("Index", "Dashboard") ?? "/";
        }

        return LocalRedirect(target);
    }

    [HttpPost, ValidateAntiForgeryToken]
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
    [Required, MinLength(8)] public string Password { get; set; } = string.Empty;
    [Compare(nameof(Password))] public string ConfirmPassword { get; set; } = string.Empty;
    public string? ReturnUrl { get; set; }
}
