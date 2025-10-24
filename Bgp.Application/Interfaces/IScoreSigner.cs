namespace Bgp.Application.Interfaces;

public interface IScoreSigner
{
    string ComputeSignature(string key, Guid sessionId, double score);
}
