using System.IO.Compression;
using Bgp.Application.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

namespace Bgp.Infrastructure.Storage;

public class FileStorageLocal : IFileStorage
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<FileStorageLocal> _logger;

    public FileStorageLocal(IWebHostEnvironment env, ILogger<FileStorageLocal> logger)
    {
        _env = env;
        _logger = logger;
    }

    public async Task<string> SaveAsync(Stream content, string fileName, string subfolder, CancellationToken ct = default)
    {
        var safeName = Path.GetFileName(fileName);
        var root = Path.Combine(_env.WebRootPath ?? "wwwroot", subfolder);
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, safeName);

        await using var fs = File.Create(path);
        await content.CopyToAsync(fs, ct);

        var relative = Path.Combine(subfolder, safeName).Replace("\\", "/");
        _logger.LogInformation("Saved file {File} to {Path}", safeName, relative);
        return "/" + relative;
    }

    public async Task ExtractZipAsync(Stream zipStream, string targetSubfolder, CancellationToken ct = default)
    {
        var root = Path.Combine(_env.WebRootPath ?? "wwwroot", targetSubfolder);
        if (Directory.Exists(root))
        {
            try
            {
                Directory.Delete(root, true);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to clear existing game directory {Directory}", root);
            }
        }
        Directory.CreateDirectory(root);

        var temp = Path.GetTempFileName();
        await using (var f = File.OpenWrite(temp))
        {
            await zipStream.CopyToAsync(f, ct);
        }

        ZipFile.ExtractToDirectory(temp, root, true);
        File.Delete(temp);
    }
}
