namespace Bgp.Application.Interfaces;

public interface IDateTimeProvider
{
    DateTime UtcNow { get; }
}
