using System;
using System.ComponentModel.DataAnnotations;
using Bgp.Infrastructure.Identity;
using Bgp.Web.Resources;
using System.Collections.Generic;
using System.Linq;
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
            SecurityQuestion1Key = vm.SecurityQuestion1,
            SecurityQuestion1CustomPrompt = vm.SecurityQuestion1Custom,
            SecurityQuestion2Key = vm.SecurityQuestion2,
            SecurityQuestion2CustomPrompt = vm.SecurityQuestion2Custom,
            SecurityQuestion3Key = vm.SecurityQuestion3,
            SecurityQuestion3CustomPrompt = vm.SecurityQuestion3Custom
        };

        if (!string.IsNullOrWhiteSpace(vm.SecurityAnswer1))
        {
            user.SecurityQuestion1AnswerHash = _users.PasswordHasher.HashPassword(user, vm.SecurityAnswer1.Trim());
        }
        if (!string.IsNullOrWhiteSpace(vm.SecurityAnswer2))
        {
            user.SecurityQuestion2AnswerHash = _users.PasswordHasher.HashPassword(user, vm.SecurityAnswer2.Trim());
        }
        if (!string.IsNullOrWhiteSpace(vm.SecurityAnswer3))
        {
            user.SecurityQuestion3AnswerHash = _users.PasswordHasher.HashPassword(user, vm.SecurityAnswer3.Trim());
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

        await _signIn.SignInAsync(user, isPersistent: false);
        await _presenceNotifier.BroadcastAsync(user.Id, user.StatusMessage, user.PresenceStatus, user.IsInvisible);
        var target = vm.ReturnUrl;
        if (string.IsNullOrWhiteSpace(target))
        {
            target = Url.Action("Index", "Dashboard") ?? "/";
        }

        return LocalRedirect(target);
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

        bool IsAnswerValid(string? hash, string? answer) =>
            !string.IsNullOrWhiteSpace(hash) && !string.IsNullOrWhiteSpace(answer) &&
            _users.PasswordHasher.VerifyHashedPassword(user, hash, answer.Trim()) == PasswordVerificationResult.Success;

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
}

public class LoginVm
{
    [Required] public string LoginOrEmail { get; set; } = string.Empty;
    [Required] public string Password { get; set; } = string.Empty;
    public bool RememberMe { get; set; }
    public string? ReturnUrl { get; set; }
}

public class RegisterVm : IValidatableObject
{
    [Required] public string Login { get; set; } = string.Empty;
    [Required, EmailAddress] public string Email { get; set; } = string.Empty;
    [Required, MinLength(8)] public string Password { get; set; } = string.Empty;
    [Compare(nameof(Password))] public string ConfirmPassword { get; set; } = string.Empty;
    public string? ReturnUrl { get; set; }

    [Required]
    [DataType(DataType.Date)]
    public DateTime? BirthDate { get; set; }

    [Required]
    public string SecurityQuestion1 { get; set; } = string.Empty;

    public string? SecurityQuestion1Custom { get; set; }

    [Required]
    public string SecurityAnswer1 { get; set; } = string.Empty;

    [Required]
    public string SecurityQuestion2 { get; set; } = string.Empty;

    public string? SecurityQuestion2Custom { get; set; }

    [Required]
    public string SecurityAnswer2 { get; set; } = string.Empty;

    [Required]
    public string SecurityQuestion3 { get; set; } = string.Empty;

    public string? SecurityQuestion3Custom { get; set; }

    [Required]
    public string SecurityAnswer3 { get; set; } = string.Empty;

    public List<SecurityQuestionOptionVm> SecurityQuestionOptions { get; private set; } = new();

    public void PopulateSecurityQuestionOptions(IStringLocalizer<SharedResource> localizer)
    {
        SecurityQuestionOptions = SecurityQuestionCatalog.Options
            .Select(option => new SecurityQuestionOptionVm(option.Key, localizer[option.ResourceKey].Value, option.AllowsCustomPrompt))
            .ToList();
    }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        var localizer = validationContext.GetService(typeof(IStringLocalizer<SharedResource>)) as IStringLocalizer<SharedResource>;
        string Localize(string key) => localizer?[key].Value ?? key;

        if (BirthDate.HasValue && BirthDate.Value.Date > DateTime.Today)
        {
            yield return new ValidationResult(Localize("Auth_Register_BirthDate_Future"), new[] { nameof(BirthDate) });
        }

        var questionKeys = new[] { SecurityQuestion1, SecurityQuestion2, SecurityQuestion3 };
        if (questionKeys.Any(string.IsNullOrWhiteSpace))
        {
            yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_Required"), new[]
            {
                nameof(SecurityQuestion1), nameof(SecurityQuestion2), nameof(SecurityQuestion3)
            });
            yield break;
        }

        if (questionKeys.GroupBy(x => x).Any(g => g.Count() > 1))
        {
            yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_Distinct"), new[]
            {
                nameof(SecurityQuestion1), nameof(SecurityQuestion2), nameof(SecurityQuestion3)
            });
        }

        IEnumerable<ValidationResult> ValidateCustom(string key, string? custom, string questionMemberName, string customMemberName)
        {
            var option = SecurityQuestionCatalog.Find(key);
            if (option is null)
            {
                yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_Invalid"), new[] { questionMemberName });
                yield break;
            }

            if (option.AllowsCustomPrompt && string.IsNullOrWhiteSpace(custom))
            {
                yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_CustomRequired"), new[] { customMemberName });
            }
        }

        foreach (var result in ValidateCustom(SecurityQuestion1, SecurityQuestion1Custom, nameof(SecurityQuestion1), nameof(SecurityQuestion1Custom)))
        {
            yield return result;
        }

        foreach (var result in ValidateCustom(SecurityQuestion2, SecurityQuestion2Custom, nameof(SecurityQuestion2), nameof(SecurityQuestion2Custom)))
        {
            yield return result;
        }

        foreach (var result in ValidateCustom(SecurityQuestion3, SecurityQuestion3Custom, nameof(SecurityQuestion3), nameof(SecurityQuestion3Custom)))
        {
            yield return result;
        }
    }
}

public record SecurityQuestionOptionVm(string Key, string Label, bool AllowsCustomPrompt);

public class ForgotPasswordVm
{
    [Required]
    public string LoginOrEmail { get; set; } = string.Empty;

    public string? ReturnUrl { get; set; }
}

public record RecoverPasswordQuestionVm(string Key, string Prompt)
{
    [Required]
    public string? Answer { get; set; }
}

public class RecoverPasswordVm
{
    [Required]
    public string UserId { get; set; } = string.Empty;

    public string LoginOrEmail { get; set; } = string.Empty;

    public string? ReturnUrl { get; set; }

    public List<RecoverPasswordQuestionVm> Questions { get; set; } = new();

    [Required, MinLength(8)]
    public string NewPassword { get; set; } = string.Empty;

    [Compare(nameof(NewPassword))]
    public string ConfirmPassword { get; set; } = string.Empty;
}

public class RecoverPasswordSuccessVm
{
    public string LoginOrEmail { get; set; } = string.Empty;
    public string? ReturnUrl { get; set; }
}
