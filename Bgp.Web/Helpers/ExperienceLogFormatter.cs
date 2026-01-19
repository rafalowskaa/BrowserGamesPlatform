using System;
using System.Globalization;

namespace Bgp.Web.Helpers;

public readonly record struct ExperienceLogDetails(int Amount, string? Code, string? Details, string? Reference);

public static class ExperienceLogFormatter
{
    public static string BuildMessage(int amount, string code, string? details = null, string? reference = null)
    {
        var safeDetails = Sanitize(details);
        var safeReference = Sanitize(reference);
        return string.Join("|",
            amount.ToString(CultureInfo.InvariantCulture),
            code,
            safeDetails ?? string.Empty,
            safeReference ?? string.Empty);
    }

    public static ExperienceLogDetails Parse(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return new ExperienceLogDetails(0, null, null, null);
        }

        var parts = message.Split('|', 4, StringSplitOptions.None);
        if (parts.Length == 1)
        {
            return int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var amount)
                ? new ExperienceLogDetails(amount, null, null, null)
                : new ExperienceLogDetails(0, null, message, null);
        }

        var parsedAmount = int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value
            : 0;
        var code = Normalize(parts.Length > 1 ? parts[1] : null);
        var details = Normalize(parts.Length > 2 ? parts[2] : null);
        var reference = Normalize(parts.Length > 3 ? parts[3] : null);

        return new ExperienceLogDetails(parsedAmount, code, details, reference);
    }

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static string? Sanitize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Replace('|', '/');
    }
}