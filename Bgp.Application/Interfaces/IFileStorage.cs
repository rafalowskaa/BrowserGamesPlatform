namespace Bgp.Application.Interfaces;

public interface IFileStorage
{
    Task<string> SaveAsync(Stream content, string fileName, string subfolder, CancellationToken ct = default);
    Task ExtractZipAsync(Stream zipStream, string targetSubfolder, CancellationToken ct = default);
}
