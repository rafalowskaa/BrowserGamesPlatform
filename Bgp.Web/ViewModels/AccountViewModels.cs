using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using Bgp.Web.Helpers;
using Bgp.Web.Models;
using Bgp.Web.Resources;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.ViewModels;

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
            var key = entry.Key;
            var custom = entry.Custom;
            var answer = entry.Answer;

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