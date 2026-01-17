using System.Security.Cryptography;
using System.Text;
using Bgp.Application.Interfaces;

namespace Bgp.Infrastructure.Security;

public class HmacScoreSigner : IScoreSigner
{
    public string ComputeSignature(string key, Guid sessionId, double score)
    {
        var message = FormattableString.Invariant($"{sessionId}:{score}");
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(key));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(message));
        return Convert.ToHexString(hash);
    }
}
