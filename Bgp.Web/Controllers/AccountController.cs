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
}

public class LoginVm
{
    [Required] public string LoginOrEmail { get; set; } = string.Empty;
    [Required] public string Password { get; set; } = string.Empty;
    public bool RememberMe { get; set; }
    public string? ReturnUrl { get; set; }
    public string? Intent { get; set; }
    public string? PromptMessage { get; set; }
}

public class RegisterVm : IValidatableObject
{
    [Required] public string Login { get; set; } = string.Empty;
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(8)]
    [RegularExpression(@"^(?=.*\d).+$", ErrorMessageResourceType = typeof(SharedResource), ErrorMessageResourceName = "Auth_Register_Password_RequireDigit")]
    public string Password { get; set; } = string.Empty;

    [Compare(nameof(Password), ErrorMessageResourceType = typeof(SharedResource), ErrorMessageResourceName = "Auth_Register_Password_Mismatch")]
    public string ConfirmPassword { get; set; } = string.Empty;
    public string? ReturnUrl { get; set; }

    [DataType(DataType.Date)]
    public DateTime? BirthDate { get; set; }

    public string SecurityQuestion1 { get; set; } = string.Empty;

    public string? SecurityQuestion1Custom { get; set; }

    public string SecurityAnswer1 { get; set; } = string.Empty;

    public string SecurityQuestion2 { get; set; } = string.Empty;

    public string? SecurityQuestion2Custom { get; set; }

    public string SecurityAnswer2 { get; set; } = string.Empty;

    public string SecurityQuestion3 { get; set; } = string.Empty;

    public string? SecurityQuestion3Custom { get; set; }

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

        const int answerMinLength = 3;
        const int customMinLength = 5;

        string TrimOrEmpty(string? value) => (value ?? string.Empty).Trim();
        string? TrimOrNull(string? value)
        {
            var trimmed = (value ?? string.Empty).Trim();
            return string.IsNullOrEmpty(trimmed) ? null : trimmed;
        }

        SecurityQuestion1 = TrimOrEmpty(SecurityQuestion1);
        SecurityQuestion2 = TrimOrEmpty(SecurityQuestion2);
        SecurityQuestion3 = TrimOrEmpty(SecurityQuestion3);
        SecurityAnswer1 = TrimOrEmpty(SecurityAnswer1);
        SecurityAnswer2 = TrimOrEmpty(SecurityAnswer2);
        SecurityAnswer3 = TrimOrEmpty(SecurityAnswer3);
        SecurityQuestion1Custom = TrimOrNull(SecurityQuestion1Custom);
        SecurityQuestion2Custom = TrimOrNull(SecurityQuestion2Custom);
        SecurityQuestion3Custom = TrimOrNull(SecurityQuestion3Custom);

        var bannedAnswers = new HashSet<string>(new[]
        {
            "1234", "0000", "1111", "9999", "12345", "00000", "abcd", "qwerty", "password", "haslo", "hasło", "pass", "test", "admin"
        }, StringComparer.OrdinalIgnoreCase);

        var entries = new[]
        {
            new { Index = 0, QuestionMember = nameof(SecurityQuestion1), CustomMember = nameof(SecurityQuestion1Custom), AnswerMember = nameof(SecurityAnswer1), Key = SecurityQuestion1, Custom = SecurityQuestion1Custom, Answer = SecurityAnswer1 },
            new { Index = 1, QuestionMember = nameof(SecurityQuestion2), CustomMember = nameof(SecurityQuestion2Custom), AnswerMember = nameof(SecurityAnswer2), Key = SecurityQuestion2, Custom = SecurityQuestion2Custom, Answer = SecurityAnswer2 },
            new { Index = 2, QuestionMember = nameof(SecurityQuestion3), CustomMember = nameof(SecurityQuestion3Custom), AnswerMember = nameof(SecurityAnswer3), Key = SecurityQuestion3, Custom = SecurityQuestion3Custom, Answer = SecurityAnswer3 }
        };

        var usedKeys = new List<string>();

        foreach (var entry in entries)
        {
            var key = TrimOrEmpty(entry.Key);
            var custom = TrimOrNull(entry.Custom);
            var answer = TrimOrEmpty(entry.Answer);

            switch (entry.Index)
            {
                case 0:
                    SecurityQuestion1 = key;
                    SecurityQuestion1Custom = custom;
                    SecurityAnswer1 = answer;
                    break;
                case 1:
                    SecurityQuestion2 = key;
                    SecurityQuestion2Custom = custom;
                    SecurityAnswer2 = answer;
                    break;
                default:
                    SecurityQuestion3 = key;
                    SecurityQuestion3Custom = custom;
                    SecurityAnswer3 = answer;
                    break;
            }

            var hasInput = !string.IsNullOrWhiteSpace(key) || !string.IsNullOrWhiteSpace(custom) || !string.IsNullOrWhiteSpace(answer);
            if (!hasInput)
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(key))
            {
                yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_SelectRequired"), new[] { entry.QuestionMember });
                continue;
            }

            var option = SecurityQuestionCatalog.Find(key);
            if (option is null)
            {
                yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_Invalid"), new[] { entry.QuestionMember });
                continue;
            }

            if (!option.AllowsCustomPrompt)
            {
                usedKeys.Add(key);
            }

            if (option.AllowsCustomPrompt)
            {
                if (string.IsNullOrWhiteSpace(custom) || custom.Length < customMinLength)
                {
                    yield return new ValidationResult(string.Format(Localize("Auth_Register_SecurityQuestions_Custom_MinLength"), customMinLength), new[] { entry.CustomMember });
                }
            }
            else
            {
                custom = null;
                switch (entry.Index)
                {
                    case 0:
                        SecurityQuestion1Custom = null;
                        break;
                    case 1:
                        SecurityQuestion2Custom = null;
                        break;
                    default:
                        SecurityQuestion3Custom = null;
                        break;
                }
            }


            if (string.IsNullOrWhiteSpace(answer) || answer.Length < answerMinLength)
            {
                yield return new ValidationResult(string.Format(Localize("Auth_SecurityQuestions_Answer_MinLength"), answerMinLength), new[] { entry.AnswerMember });
                continue;
            }
            var questionText = option.AllowsCustomPrompt && !string.IsNullOrWhiteSpace(custom)
                            ? custom!
                            : Localize(option.ResourceKey);

            if (!string.IsNullOrWhiteSpace(questionText) && string.Equals(questionText.Trim(), answer, StringComparison.OrdinalIgnoreCase))
            {
                yield return new ValidationResult(Localize("Auth_SecurityQuestions_Answer_MatchesQuestion"), new[] { entry.AnswerMember });
            }
            else if (bannedAnswers.Contains(answer))
            {
                yield return new ValidationResult(Localize("Auth_SecurityQuestions_Answer_Common"), new[] { entry.AnswerMember });
            }
        }

        if (usedKeys.GroupBy(x => x, StringComparer.OrdinalIgnoreCase).Any(g => g.Count() > 1))
        {
            yield return new ValidationResult(Localize("Auth_Register_SecurityQuestions_Distinct"), new[]
            {
                nameof(SecurityQuestion1), nameof(SecurityQuestion2), nameof(SecurityQuestion3)
            });
        }
    }
}

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
