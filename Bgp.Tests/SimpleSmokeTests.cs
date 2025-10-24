using Xunit;

namespace Bgp.Tests;

public class SimpleSmokeTests
{
    [Fact]
    public void Slug_Generation_Is_Stable()
    {
        string Slugify(string text)
        {
            var slug = new string(text
                .ToLowerInvariant()
                .Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')
                .ToArray());
            while (slug.Contains("--")) slug = slug.Replace("--", "-");
            return slug.Trim('-');
        }

        Assert.Equal("super-gra-123", Slugify("Super gra!!! 123"));
    }
}
