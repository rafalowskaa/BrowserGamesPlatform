using System;
using System.ComponentModel.DataAnnotations;
using Bgp.Infrastructure.Identity;
using Bgp.Web.Resources;
using System.Collections.Generic;
using System.Linq;
using Bgp.Web.Models;
using Bgp.Domain.Enums;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Localization;
using Bgp.Web.ViewModels;
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
    public IActionResult Login(string? returnUrl = null, string? prefillLogin = null, string? intent = null)
    {
        var vm = new LoginVm
        {
            ReturnUrl = returnUrl,
            LoginOrEmail = prefillLogin ?? string.Empty,
            Intent = intent,
            PromptMessage = GetLoginPrompt(intent)
        };

        return View(vm);
    }

    [HttpPost, AllowAnonymous, ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(LoginVm vm)
    {
        vm.PromptMessage = GetLoginPrompt(vm.Intent);
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
    public IActionResult Register(string? returnUrl = null)
    {
        var vm = new RegisterVm { ReturnUrl = returnUrl };
        vm.PopulateSecurityQuestionOptions(_localizer);
        return View(vm);
    }

    [HttpPost, AllowAnonymous, ValidateAntiForgeryToken]
    public async Task<IActionResult> Register(RegisterVm vm)
    {
        vm.PopulateSecurityQuestionOptions(_localizer);
        if (!ModelState.IsValid) return View(vm);

        var providedQuestions = new[]
        {
            new { Key = vm.SecurityQuestion1, Custom = vm.SecurityQuestion1Custom, Answer = vm.SecurityAnswer1 },
            new { Key = vm.SecurityQuestion2, Custom = vm.SecurityQuestion2Custom, Answer = vm.SecurityAnswer2 },
            new { Key = vm.SecurityQuestion3, Custom = vm.SecurityQuestion3Custom, Answer = vm.SecurityAnswer3 }
        }
        .Where(q => !string.IsNullOrWhiteSpace(q.Key) && !string.IsNullOrWhiteSpace(q.Answer))
        .Select(q => new
        {
            Key = (q.Key ?? string.Empty).Trim(),
            Custom = string.IsNullOrWhiteSpace(q.Custom) ? null : q.Custom!.Trim(),
            Answer = (q.Answer ?? string.Empty).Trim()
        })
        .ToList();

        string? GetKeyAt(int index) => index < providedQuestions.Count ? providedQuestions[index].Key : null;
        string? GetCustomAt(int index) => index < providedQuestions.Count ? providedQuestions[index].Custom : null;
        string? GetAnswerAt(int index) => index < providedQuestions.Count ? providedQuestions[index].Answer : null;

        var user = new ApplicationUser
        {
            UserName = vm.Login,
            Email = vm.Email,
            DisplayName = DisplayNameFormatter.Format(vm.Login),
            EmailConfirmed = true, // DEV: w produkcji – wysyłka maila weryfikacyjnego
            DisplayNameLastApprovedAtUtc = DateTime.UtcNow,
            PresenceStatus = UserPresenceStatus.Available,
            IsInvisible = false,
            BirthDate = vm.BirthDate?.Date,
            BirthMonth = vm.BirthDate?.Month,
            BirthDay = vm.BirthDate?.Day,
            BirthYear = vm.BirthDate?.Year,
            SecurityQuestion1Key = GetKeyAt(0),
            SecurityQuestion1CustomPrompt = GetCustomAt(0),
            SecurityQuestion2Key = GetKeyAt(1),
            SecurityQuestion2CustomPrompt = GetCustomAt(1),
            SecurityQuestion3Key = GetKeyAt(2),
            SecurityQuestion3CustomPrompt = GetCustomAt(2)
        };

        var answer1 = GetAnswerAt(0);
        if (!string.IsNullOrWhiteSpace(answer1))
        {
            var normalizedAnswer = SecurityAnswerHelper.Normalize(answer1);
            user.SecurityQuestion1AnswerHash = _users.PasswordHasher.HashPassword(user, normalizedAnswer);
        }
        var answer2 = GetAnswerAt(1);
        if (!string.IsNullOrWhiteSpace(answer2))
        {
            var normalizedAnswer = SecurityAnswerHelper.Normalize(answer2);
            user.SecurityQuestion2AnswerHash = _users.PasswordHasher.HashPassword(user, normalizedAnswer);
        }
        var answer3 = GetAnswerAt(2);
        if (!string.IsNullOrWhiteSpace(answer3))
        {
            var normalizedAnswer = SecurityAnswerHelper.Normalize(answer3);
            user.SecurityQuestion3AnswerHash = _users.PasswordHasher.HashPassword(user, normalizedAnswer);
        }

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

        string? loginReturnUrl = null;
        if (!string.IsNullOrWhiteSpace(vm.ReturnUrl))
        {
            var trimmedReturnUrl = vm.ReturnUrl.Trim();
            if (Url.IsLocalUrl(trimmedReturnUrl))
            {
                var registerPath = Url.Action(nameof(Register)) ?? string.Empty;
                var isRegisterReturn = false;
                if (!string.IsNullOrEmpty(registerPath) && trimmedReturnUrl.StartsWith(registerPath, StringComparison.OrdinalIgnoreCase))
                {
                    var remainder = trimmedReturnUrl.Substring(registerPath.Length);
                    isRegisterReturn = string.IsNullOrEmpty(remainder) || remainder.StartsWith("?") || remainder.StartsWith("#");
                }

                if (!isRegisterReturn)
                {
                    loginReturnUrl = trimmedReturnUrl;
                }
            }
        }

        return RedirectToAction(nameof(Login), new { returnUrl = loginReturnUrl, prefillLogin = vm.Login });
    }

    [AllowAnonymous]
    public IActionResult ForgotPassword(string? returnUrl = null) => View(new ForgotPasswordVm { ReturnUrl = returnUrl });

    [HttpPost, AllowAnonymous, ValidateAntiForgeryToken]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordVm vm)
    {
        if (!ModelState.IsValid) return View(vm);

        var identifier = vm.LoginOrEmail.Trim();
        vm.LoginOrEmail = identifier;

        ApplicationUser? user = null;
        if (identifier.Contains('@'))
        {
            user = await _users.FindByEmailAsync(identifier);
        }
        user ??= await _users.FindByNameAsync(identifier);

        if (user is null)
        {
            ModelState.AddModelError(string.Empty, _localizer["Account_PasswordRecovery_UserNotFound"]);
            return View(vm);
        }

        var questions = BuildRecoveryQuestions(user).ToList();
        if (questions.Count == 0)
        {
            ModelState.AddModelError(string.Empty, _localizer["Account_PasswordRecovery_NoQuestions"]);
            return View(vm);
        }

        var recoverVm = new RecoverPasswordVm
        {
            UserId = user.Id,
            LoginOrEmail = identifier,
            Questions = questions,
            ReturnUrl = vm.ReturnUrl
        };

        return View("RecoverPassword", recoverVm);
    }

    [HttpPost, AllowAnonymous, ValidateAntiForgeryToken]
    public async Task<IActionResult> RecoverPassword(RecoverPasswordVm vm)
    {
        if (string.IsNullOrWhiteSpace(vm.UserId))
        {
            ModelState.AddModelError(string.Empty, _localizer["Account_PasswordRecovery_UserNotFound"]);
            vm.Questions.Clear();
            return View(vm);
        }

        var user = await _users.FindByIdAsync(vm.UserId);
        if (user is null)
        {
            ModelState.AddModelError(string.Empty, _localizer["Account_PasswordRecovery_UserNotFound"]);
            vm.Questions.Clear();
            return View(vm);
        }

        var expectedQuestions = BuildRecoveryQuestions(user).ToList();
        if (expectedQuestions.Count == 0)
        {
            ModelState.AddModelError(string.Empty, _localizer["Account_PasswordRecovery_NoQuestions"]);
            vm.Questions = expectedQuestions;
            return View(vm);
        }

        vm.Questions ??= new List<RecoverPasswordQuestionVm>();

        for (var i = 0; i < expectedQuestions.Count; i++)
        {
            var providedAnswer = vm.Questions.ElementAtOrDefault(i)?.Answer;
            expectedQuestions[i] = expectedQuestions[i] with { Answer = providedAnswer };
            if (string.IsNullOrWhiteSpace(providedAnswer))
            {
                ModelState.AddModelError($"Questions[{i}].Answer", _localizer["Account_PasswordRecovery_AnswerRequired"]);
            }
        }

        vm.Questions = expectedQuestions;

        if (!ModelState.IsValid) return View(vm);

        bool IsAnswerValid(string? hash, string? answer)
        {
            if (string.IsNullOrWhiteSpace(hash) || string.IsNullOrWhiteSpace(answer))
            {
                return false;
            }

            var normalized = SecurityAnswerHelper.Normalize(answer);
            return _users.PasswordHasher.VerifyHashedPassword(user, hash, normalized) == PasswordVerificationResult.Success;
        }

        var answersValid = IsAnswerValid(user.SecurityQuestion1AnswerHash, vm.Questions.ElementAtOrDefault(0)?.Answer)
                           && IsAnswerValid(user.SecurityQuestion2AnswerHash, vm.Questions.ElementAtOrDefault(1)?.Answer)
                           && IsAnswerValid(user.SecurityQuestion3AnswerHash, vm.Questions.ElementAtOrDefault(2)?.Answer);

        if (!answersValid)
        {
            ModelState.AddModelError(string.Empty, _localizer["Account_PasswordRecovery_InvalidAnswers"]);
            return View(vm);
        }

        if (!ModelState.IsValid) return View(vm);

        var token = await _users.GeneratePasswordResetTokenAsync(user);
        var resetResult = await _users.ResetPasswordAsync(user, token, vm.NewPassword);
        if (!resetResult.Succeeded)
        {
            foreach (var error in resetResult.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }
            return View(vm);
        }

        return View("RecoverPasswordSuccess", new RecoverPasswordSuccessVm { LoginOrEmail = vm.LoginOrEmail, ReturnUrl = vm.ReturnUrl });
    }

    private IEnumerable<RecoverPasswordQuestionVm> BuildRecoveryQuestions(ApplicationUser user)
    {
        var list = new List<RecoverPasswordQuestionVm>();
        void Add(string? key, string? customPrompt)
        {
            if (string.IsNullOrWhiteSpace(key)) return;
            var option = SecurityQuestionCatalog.Find(key);
            if (option is null) return;
            var prompt = option.AllowsCustomPrompt && !string.IsNullOrWhiteSpace(customPrompt)
                ? customPrompt!
                : _localizer[option.ResourceKey].Value;
            list.Add(new RecoverPasswordQuestionVm(key, prompt));
        }

        Add(user.SecurityQuestion1Key, user.SecurityQuestion1CustomPrompt);
        Add(user.SecurityQuestion2Key, user.SecurityQuestion2CustomPrompt);
        Add(user.SecurityQuestion3Key, user.SecurityQuestion3CustomPrompt);
        return list;
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

    private string? GetLoginPrompt(string? intent)
    {
        if (string.Equals(intent, "play", StringComparison.OrdinalIgnoreCase))
        {
            return _localizer["Auth_Login_PlayPrompt"].Value;
        }

        return null;
    }

}

