using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text.Encodings.Web;
using System.Text.RegularExpressions;

namespace Bgp.Web.Helpers;

public static class RulesContentHelper
{
    private static readonly Regex HtmlTagRegex = new("<\\s*([a-z][^>]*)>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ScriptStyleRegex = new("<(script|style)[^>]*>[\\s\\S]*?</\\1>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex EventHandlerRegex = new("\\s+on\\w+\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex AttributeRegex = new("(?<name>[a-zA-Z0-9:-]+)\\s*=\\s*(?<value>\"[^\"]*\"|'[^']*'|[^\\s>]+)", RegexOptions.Compiled);
    private static readonly Regex TagRegex = new("<\\s*/?\\s*(?<name>[a-z0-9]+)(?<attrs>[^>]*)>", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly HashSet<string> AllowedTags = new(StringComparer.OrdinalIgnoreCase)
    {
        "p", "br", "div", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "span", "img", "a"
    };

    private static readonly HashSet<string> AllowedSpanClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        "rules-size-sm",
        "rules-size-md",
        "rules-size-lg"
    };

    public static bool LooksLikeHtml(string? content)
    {
        return !string.IsNullOrWhiteSpace(content) && HtmlTagRegex.IsMatch(content);
    }

    public static string FormatForDisplay(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return string.Empty;
        }

        if (LooksLikeHtml(content))
        {
            return SanitizeHtml(content);
        }

        var sanitized = HtmlEncoder.Default.Encode(content.Replace("\r\n", "\n"));
        var paragraphs = sanitized
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(block => $"<p>{block.Replace("\n", "<br />")}</p>")
            .ToList();

        return paragraphs.Count == 0 ? string.Empty : string.Join(Environment.NewLine, paragraphs);
    }

    public static string FormatForEditor(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return string.Empty;
        }

        if (LooksLikeHtml(content))
        {
            return SanitizeHtml(content);
        }

        var sanitized = HtmlEncoder.Default.Encode(content.Replace("\r\n", "\n"));
        return sanitized.Replace("\n", "<br />");
    }

    public static string ToPlainText(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return string.Empty;
        }

        if (!LooksLikeHtml(content))
        {
            return content.Trim();
        }

        var stripped = TagRegex.Replace(content, string.Empty);
        return WebUtility.HtmlDecode(stripped).Trim();
    }

    public static string SanitizeHtml(string html)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return string.Empty;
        }

        var cleaned = ScriptStyleRegex.Replace(html, string.Empty);
        cleaned = EventHandlerRegex.Replace(cleaned, string.Empty);
        cleaned = Regex.Replace(cleaned, "\\s+srcdoc\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", string.Empty, RegexOptions.IgnoreCase);

        cleaned = TagRegex.Replace(cleaned, match =>
        {
            var tagName = match.Groups["name"].Value.ToLowerInvariant();
            var attrs = match.Groups["attrs"].Value;

            if (!AllowedTags.Contains(tagName))
            {
                return string.Empty;
            }

            if (match.Value.StartsWith("</", StringComparison.Ordinal))
            {
                return $"</{tagName}>";
            }

            var sanitizedAttributes = SanitizeAttributes(tagName, attrs);
            return string.IsNullOrEmpty(sanitizedAttributes)
                ? $"<{tagName}>"
                : $"<{tagName} {sanitizedAttributes}>";
        });

        return cleaned;
    }

    private static string SanitizeAttributes(string tagName, string attrs)
    {
        if (string.IsNullOrWhiteSpace(attrs))
        {
            return string.Empty;
        }

        var allowed = tagName switch
        {
            "img" => new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "src", "alt", "title" },
            "a" => new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "href", "target", "rel" },
            "span" => new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "class", "style" },
            _ => new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        };

        var results = new List<string>();

        foreach (Match attr in AttributeRegex.Matches(attrs))
        {
            var name = attr.Groups["name"].Value;
            var value = attr.Groups["value"].Value.Trim().Trim('"', '\'');

            if (!allowed.Contains(name))
            {
                continue;
            }

            if (tagName == "span" && name.Equals("class", StringComparison.OrdinalIgnoreCase))
            {
                var classes = value
                    .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Where(c => AllowedSpanClasses.Contains(c))
                    .ToList();
                if (classes.Count == 0)
                {
                    continue;
                }
                value = string.Join(" ", classes);
            }

            if (tagName == "span" && name.Equals("style", StringComparison.OrdinalIgnoreCase))
            {
                var sanitizedStyle = SanitizeSpanStyle(value);
                if (string.IsNullOrWhiteSpace(sanitizedStyle))
                {
                    continue;
                }
                value = sanitizedStyle;
            }

            if (tagName == "img" && name.Equals("src", StringComparison.OrdinalIgnoreCase))
            {
                if (!IsSafeUrl(value, allowRemote: false))
                {
                    continue;
                }
            }

            if (tagName == "a" && name.Equals("href", StringComparison.OrdinalIgnoreCase))
            {
                if (!IsSafeUrl(value, allowRemote: true))
                {
                    continue;
                }
            }

            results.Add($"{name}=\"{WebUtility.HtmlEncode(value)}\"");
        }

        return string.Join(" ", results);
    }

    private static string SanitizeSpanStyle(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var allowed = new List<string>();
        var declarations = value.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var declaration in declarations)
        {
            var parts = declaration.Split(':', 2, StringSplitOptions.TrimEntries);
            if (parts.Length != 2)
            {
                continue;
            }

            var property = parts[0].ToLowerInvariant();
            var rawValue = parts[1].ToLowerInvariant();
            if (property == "font-weight")
            {
                var numericValue = int.TryParse(rawValue, out var numeric) ? numeric : 0;
                if (rawValue.Contains("bold") || numericValue >= 600)
                {
                    allowed.Add("font-weight: bold");
                }
            }
            else if (property == "font-style" && rawValue.Contains("italic"))
            {
                allowed.Add("font-style: italic");
            }
            else if (property == "text-decoration")
            {
                var decorations = new List<string>();
                if (rawValue.Contains("underline"))
                {
                    decorations.Add("underline");
                }
                if (rawValue.Contains("line-through"))
                {
                    decorations.Add("line-through");
                }
                if (decorations.Count > 0)
                {
                    allowed.Add($"text-decoration: {string.Join(' ', decorations)}");
                }
            }
        }

        return string.Join("; ", allowed);
    }

    private static bool IsSafeUrl(string value, bool allowRemote)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        if (value.StartsWith("data:image", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (value.StartsWith("/", StringComparison.Ordinal) || value.StartsWith("./", StringComparison.Ordinal) || value.StartsWith("../", StringComparison.Ordinal))
        {
            return true;
        }

        if (!allowRemote)
        {
            return false;
        }

        if (Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            return uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeMailto;
        }

        return false;
    }
}