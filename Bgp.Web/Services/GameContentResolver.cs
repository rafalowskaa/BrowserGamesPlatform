using System.IO;
using System.Linq;
using System.Text;
using Bgp.Web.Models;
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
            options.Add(new GamePlayOptionViewModel(
                "web",
                "Browser",
                relative,
                null,
                null));
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
}