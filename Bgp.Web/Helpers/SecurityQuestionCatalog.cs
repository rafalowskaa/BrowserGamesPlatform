using System.Collections.ObjectModel;
using System.Linq;

namespace Bgp.Web.Helpers;

public static class SecurityQuestionCatalog
{
    public const string CustomKey = "custom";

    private static readonly ReadOnlyCollection<SecurityQuestionOption> _options =
        new(new[]
        {
            new SecurityQuestionOption("firstPet", "Auth_SecurityQuestion_FirstPet"),
            new SecurityQuestionOption("favoriteTeacher", "Auth_SecurityQuestion_FavoriteTeacher"),
            new SecurityQuestionOption("childhoodNickname", "Auth_SecurityQuestion_ChildhoodNickname"),
            new SecurityQuestionOption("birthCity", "Auth_SecurityQuestion_BirthCity"),
            new SecurityQuestionOption("favoriteGame", "Auth_SecurityQuestion_FavoriteGame"),
            new SecurityQuestionOption("firstConsole", "Auth_SecurityQuestion_FirstConsole"),
            new SecurityQuestionOption(CustomKey, "Auth_SecurityQuestion_Custom", true)
        });

    public static IReadOnlyList<SecurityQuestionOption> Options => _options;

    public static SecurityQuestionOption? Find(string? key) =>
        string.IsNullOrWhiteSpace(key) ? null : _options.FirstOrDefault(o => o.Key == key);
}

public record SecurityQuestionOption(string Key, string ResourceKey, bool AllowsCustomPrompt = false);