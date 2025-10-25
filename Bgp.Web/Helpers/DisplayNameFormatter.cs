namespace Bgp.Web.Helpers;

using Bgp.Infrastructure.Identity;

public static class DisplayNameFormatter
{
    public static string Format(ApplicationUser? user, string? fallback = null)
    {
        if (user is null)
        {
            return Format(null, null, null, fallback);
        }

        return Format(user.DisplayName, user.Email, user.UserName, fallback);
    }

    public static string Format(string? displayName, string? email = null, string? userName = null, string? fallback = null)
    {
        var candidate = SelectCandidate(displayName, email, userName, fallback);
        return string.IsNullOrWhiteSpace(candidate) ? string.Empty : candidate.ToUpperInvariant();
    }

    private static string SelectCandidate(string? displayName, string? email, string? userName, string? fallback)
    {
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            return displayName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(email))
        {
            return email.Trim();
        }

        if (!string.IsNullOrWhiteSpace(userName))
        {
            return userName.Trim();
        }

        return string.IsNullOrWhiteSpace(fallback) ? string.Empty : fallback.Trim();
    }
}