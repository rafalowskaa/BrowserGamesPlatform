namespace Bgp.Web.Helpers;

public static class SecurityAnswerHelper
{
    public const string MaskedToken = "••••••";

    public static string Normalize(string? answer)
    {
        return string.IsNullOrWhiteSpace(answer)
            ? string.Empty
            : answer.Trim().ToUpperInvariant();
    }
}