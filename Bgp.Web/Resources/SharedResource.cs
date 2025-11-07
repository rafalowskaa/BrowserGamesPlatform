using System;
using Bgp.Web.Localization;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.Resources;


/// <summary>
/// Marker class for shared localization resources.
/// </summary>
public class SharedResource
{
    private static readonly Lazy<IStringLocalizer<SharedResource>> Localizer =
        new(() => SharedResourceLocalizer.Create());

    private static string Get(string key) => Localizer.Value[key].Value;

    public static string Auth_Register_Password_RequireDigit => Get(nameof(Auth_Register_Password_RequireDigit));

    public static string Auth_Register_Password_Mismatch => Get(nameof(Auth_Register_Password_Mismatch));

    public static string Auth_SecurityQuestions_Answer_MinLength => Get(nameof(Auth_SecurityQuestions_Answer_MinLength));
}