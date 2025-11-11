using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Bgp.Web.Models;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

namespace Bgp.Web.Services;

public interface IGameContentResolver
{
    IReadOnlyList<GamePlayOptionViewModel> Resolve(string? contentPath);
}

public class GameContentResolver : IGameContentResolver
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<GameContentResolver> _logger;

    private static readonly string[] ExecutableExtensions = new[]
    {
        ".exe",
        ".apk"
    };

    private static readonly string[] IgnoredExecutableNames = new[]
    {
        "UnityCrashHandler32.exe",
        "UnityCrashHandler64.exe"
    };

    public GameContentResolver(IWebHostEnvironment environment, ILogger<GameContentResolver> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    public IReadOnlyList<GamePlayOptionViewModel> Resolve(string? contentPath)
    {
        if (string.IsNullOrWhiteSpace(contentPath))
        {
            return Array.Empty<GamePlayOptionViewModel>();
        }

        var root = NormalizeRoot(contentPath);
        if (!Directory.Exists(root))
        {
            _logger.LogDebug("Content path {ContentPath} does not exist on disk", contentPath);
            return Array.Empty<GamePlayOptionViewModel>();
        }

        var options = new List<GamePlayOptionViewModel>();

        var indexFile = FindFirstIndexFile(root);
        if (indexFile is not null)
        {
            var relative = ToWebPath(indexFile);
            var metadata = LoadMetadata(root, indexFile);
            options.Add(new GamePlayOptionViewModel(
                "web",
                "Browser",
                relative,
                null,
                null,
                metadata?.NativeWidth,
                metadata?.NativeHeight,
                metadata?.AspectRatio));
        }

        foreach (var extension in ExecutableExtensions)
        {
            foreach (var file in EnumerateFiles(root, "*" + extension))
            {
                if (IgnoredExecutableNames.Contains(Path.GetFileName(file), StringComparer.OrdinalIgnoreCase))
                {
                    continue;
                }

                var relative = ToWebPath(file);
                options.Add(new GamePlayOptionViewModel(
                    "download",
                    Path.GetFileName(file),
                    relative,
                    Path.GetFileName(file),
                    BuildDownloadDescription(extension)));
            }
        }

        if (options.Count == 0)
        {
            foreach (var archive in EnumerateFiles(root, "*.zip"))
            {
                var relative = ToWebPath(archive);
                options.Add(new GamePlayOptionViewModel(
                    "download",
                    Path.GetFileName(archive),
                    relative,
                    Path.GetFileName(archive),
                    ""));
            }
        }

        return options;
    }

    private string NormalizeRoot(string contentPath)
    {
        var trimmed = contentPath.TrimStart('/', '\\');
        var webRoot = _environment.WebRootPath ?? "wwwroot";
        return Path.Combine(webRoot, trimmed.Replace('/', Path.DirectorySeparatorChar));
    }

    private static string? FindFirstIndexFile(string root)
    {
        static bool IsIndexFile(string filePath)
        {
            var fileName = Path.GetFileName(filePath);
            return fileName.Equals("index.html", StringComparison.OrdinalIgnoreCase)
                || fileName.Equals("index.htm", StringComparison.OrdinalIgnoreCase);
        }

        try
        {
            foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
            {
                if (IsIndexFile(file))
                {
                    return file;
                }
            }
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }

        return null;
    }

    private static IEnumerable<string> EnumerateFiles(string root, string pattern)
    {
        try
        {
            return Directory.EnumerateFiles(root, pattern, SearchOption.AllDirectories);
        }
        catch (IOException)
        {
            return Array.Empty<string>();
        }
        catch (UnauthorizedAccessException)
        {
            return Array.Empty<string>();
        }
    }

    private string ToWebPath(string fullPath)
    {
        var webRoot = _environment.WebRootPath ?? "wwwroot";
        var relative = Path.GetRelativePath(webRoot, fullPath);
        var builder = new StringBuilder(relative.Length + 1);
        foreach (var ch in relative)
        {
            builder.Append(ch == Path.DirectorySeparatorChar ? '/' : ch);
        }
        if (builder.Length == 0 || builder[0] != '/')
        {
            builder.Insert(0, '/');
        }
        return builder.ToString();
    }

    private static string? BuildDownloadDescription(string extension)
    {
        return extension switch
        {
            ".exe" => "Windows", // localized later in view
            ".apk" => "Android",
            _ => null
        };
    }

    private static GameContentMetadata? LoadMetadata(string root, string indexFile)
    {
        var searchDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(root) && Directory.Exists(root))
        {
            searchDirectories.Add(root);
        }

        var indexDirectory = Path.GetDirectoryName(indexFile);
        if (!string.IsNullOrWhiteSpace(indexDirectory) && Directory.Exists(indexDirectory))
        {
            searchDirectories.Add(indexDirectory);
        }

        foreach (var directory in searchDirectories)
        {
            foreach (var candidate in MetadataFileNames.Select(name => Path.Combine(directory, name)))
            {
                if (!File.Exists(candidate))
                {
                    continue;
                }

                try
                {
                    using var stream = File.OpenRead(candidate);
                    using var document = JsonDocument.Parse(stream);
                    var metadata = ExtractMetadata(document.RootElement);
                    if (metadata is not null)
                    {
                        return metadata;
                    }
                }
                catch (IOException)
                {
                    // ignore metadata read errors
                }
                catch (UnauthorizedAccessException)
                {
                    // ignore metadata read errors
                }
                catch (JsonException)
                {
                    // ignore invalid metadata structures
                }
            }
        }

        return null;
    }

    private static GameContentMetadata? ExtractMetadata(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                {
                    var nativeWidth = TryGetInt(element, "nativeWidth") ?? TryGetInt(element, "native_width");
                    var nativeHeight = TryGetInt(element, "nativeHeight") ?? TryGetInt(element, "native_height");
                    var aspectRatio = TryGetAspectRatio(element);

                    foreach (var key in NestedMetadataKeys)
                    {
                        if (!element.TryGetProperty(key, out var nested) || nested.ValueKind != JsonValueKind.Object)
                        {
                            continue;
                        }

                        var nestedMetadata = ExtractMetadata(nested);
                        if (nestedMetadata is null)
                        {
                            continue;
                        }

                        nativeWidth ??= nestedMetadata.NativeWidth;
                        nativeHeight ??= nestedMetadata.NativeHeight;
                        aspectRatio ??= nestedMetadata.AspectRatio;

                        if (nativeWidth.HasValue && nativeHeight.HasValue && aspectRatio.HasValue)
                        {
                            break;
                        }
                    }

                    if (nativeWidth.HasValue && nativeWidth.Value <= 0)
                    {
                        nativeWidth = null;
                    }

                    if (nativeHeight.HasValue && nativeHeight.Value <= 0)
                    {
                        nativeHeight = null;
                    }

                    if (nativeWidth.HasValue && nativeHeight.HasValue)
                    {
                        aspectRatio ??= nativeHeight.Value == 0 ? null : (double)nativeWidth.Value / nativeHeight.Value;
                    }

                    if (aspectRatio.HasValue && aspectRatio.Value <= 0)
                    {
                        aspectRatio = null;
                    }

                    if (nativeWidth.HasValue || nativeHeight.HasValue || aspectRatio.HasValue)
                    {
                        return new GameContentMetadata(nativeWidth, nativeHeight, aspectRatio);
                    }

                    foreach (var property in element.EnumerateObject())
                    {
                        var nested = ExtractMetadata(property.Value);
                        if (nested is not null)
                        {
                            return nested;
                        }
                    }

                    break;
                }
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    var nested = ExtractMetadata(item);
                    if (nested is not null)
                    {
                        return nested;
                    }
                }
                break;
        }

        return null;
    }

    private static int? TryGetInt(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        switch (property.ValueKind)
        {
            case JsonValueKind.Number:
                if (property.TryGetInt32(out var intValue))
                {
                    return intValue > 0 ? intValue : null;
                }
                if (property.TryGetDouble(out var doubleValue))
                {
                    var rounded = (int)Math.Round(doubleValue);
                    return rounded > 0 ? rounded : null;
                }
                break;
            case JsonValueKind.String:
                var text = property.GetString();
                if (string.IsNullOrWhiteSpace(text))
                {
                    return null;
                }
                if (int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedInt))
                {
                    return parsedInt > 0 ? parsedInt : null;
                }
                if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsedDouble))
                {
                    var rounded = (int)Math.Round(parsedDouble);
                    return rounded > 0 ? rounded : null;
                }
                break;
        }

        return null;
    }

    private static double? TryGetAspectRatio(JsonElement element)
    {
        double? ratio = TryGetDouble(element, "aspectRatio")
            ?? TryGetDouble(element, "aspect_ratio")
            ?? TryGetDouble(element, "ratio");

        if (ratio.HasValue && ratio.Value > 0)
        {
            return ratio;
        }

        return null;
    }

    private static double? TryGetDouble(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        switch (property.ValueKind)
        {
            case JsonValueKind.Number when property.TryGetDouble(out var number) && number > 0:
                return number;
            case JsonValueKind.String:
                return ParseRatioString(property.GetString());
        }

        return null;
    }

    private static double? ParseRatioString(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        var separatorIndex = trimmed.IndexOf(':');
        if (separatorIndex < 0)
        {
            separatorIndex = trimmed.IndexOf('/');
        }

        if (separatorIndex > 0)
        {
            var left = trimmed[..separatorIndex];
            var right = trimmed[(separatorIndex + 1)..];
            if (double.TryParse(left, NumberStyles.Float, CultureInfo.InvariantCulture, out var leftValue) &&
                double.TryParse(right, NumberStyles.Float, CultureInfo.InvariantCulture, out var rightValue) &&
                rightValue != 0)
            {
                var ratio = leftValue / rightValue;
                return ratio > 0 ? ratio : null;
            }
        }

        if (double.TryParse(trimmed, NumberStyles.Float, CultureInfo.InvariantCulture, out var numeric) && numeric > 0)
        {
            return numeric;
        }

        return null;
    }

    private static readonly string[] MetadataFileNames =
    {
        "bgp-metadata.json",
        "bgp.metadata.json",
        "metadata.json",
        "game-metadata.json",
        "game.json"
    };

    private static readonly string[] NestedMetadataKeys =
    {
        "resolution",
        "canvas",
        "viewport"
    };

    private sealed record GameContentMetadata(int? NativeWidth, int? NativeHeight, double? AspectRatio);
}