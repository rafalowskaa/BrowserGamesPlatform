using System;
using System.ComponentModel.DataAnnotations;
using Bgp.Infrastructure.Identity;
using Bgp.Web.Resources;
using Bgp.Domain.Enums;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Localization;
using Bgp.Web.Helpers;

namespace Bgp.Web.Controllers;

public class AccountController : Controller
{
    private readonly SignInManager<ApplicationUser> _signIn;
    private readonly UserManager<ApplicationUser> _users;
    private readonly IStringLocalizer<SharedResource> _localizer;
    private readonly IPresenceNotifier _presenceNotifier;

    public AccountController(SignInManager<ApplicationUser> signIn, UserManager<ApplicationUser> users, IStringLocalizer<SharedResource> localizer, IPresenceNotifier presenceNotifier)
    {
        _signIn = signIn;
        _users = users;
        _localizer = localizer;
        _presenceNotifier = presenceNotifier;
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

        ApplicationUser? signInUser = null;
        var userName = identifier;
        if (identifier.Contains('@'))
        {
            var byEmail = await _users.FindByEmailAsync(identifier);
            if (byEmail is not null)
            {
                signInUser = byEmail;
                userName = byEmail.UserName ?? byEmail.Email ?? identifier;
            }
        }

        signInUser ??= await _users.FindByNameAsync(userName);

        if (signInUser is not null && signInUser.IsBlocked)
        {
            if (signInUser.BlockedUntilUtc.HasValue && signInUser.BlockedUntilUtc.Value <= DateTime.UtcNow)
            {
                signInUser.IsBlocked = false;
                signInUser.BlockedUntilUtc = null;
                await _users.UpdateAsync(signInUser);
            }
            else
            {
                var message = signInUser.BlockedUntilUtc.HasValue
                    ? _localizer["Account_Blocked_Until", signInUser.BlockedUntilUtc.Value.ToLocalTime().ToString("f")]
                    : _localizer["Account_Blocked"];

                ModelState.AddModelError(string.Empty, message);
                return View(vm);
            }
        }

        var res = signInUser is not null
            ? await _signIn.PasswordSignInAsync(signInUser, vm.Password, vm.RememberMe, lockoutOnFailure: true)
            : await _signIn.PasswordSignInAsync(userName, vm.Password, vm.RememberMe, lockoutOnFailure: true);
        if (res.Succeeded)
        {
            signInUser ??= await _users.FindByNameAsync(userName);
            if (signInUser is not null)
            {
                var updated = false;
                if (signInUser.PresenceStatus != UserPresenceStatus.Available)
                {
                    signInUser.PresenceStatus = UserPresenceStatus.Available;
                    updated = true;
                }
                if (signInUser.IsInvisible)
                {
                    signInUser.IsInvisible = false;
                    updated = true;
                }

                if (updated)
                {
                    await _users.UpdateAsync(signInUser);
                }

                await _presenceNotifier.BroadcastAsync(signInUser.Id, signInUser.StatusMessage, signInUser.PresenceStatus, signInUser.IsInvisible);
            }

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
            DisplayName = DisplayNameFormatter.Format(vm.Login),
            EmailConfirmed = true, // DEV: w produkcji – wysyłka maila weryfikacyjnego
            DisplayNameLastApprovedAtUtc = DateTime.UtcNow,
            PresenceStatus = UserPresenceStatus.Available,
            IsInvisible = false
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
        await _presenceNotifier.BroadcastAsync(user.Id, user.StatusMessage, user.PresenceStatus, user.IsInvisible);
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
        var user = await _users.GetUserAsync(User);
        if (user is not null)
        {
            user.PresenceStatus = UserPresenceStatus.Offline;
            await _users.UpdateAsync(user);
            await _presenceNotifier.BroadcastAsync(user.Id, user.StatusMessage, user.PresenceStatus, user.IsInvisible);
        }

        await _signIn.SignOutAsync();
        return LocalRedirect(returnUrl ?? "/");
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
