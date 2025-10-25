using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Resources;
using Bgp.Web.Resources;
using Microsoft.Extensions.Localization;

namespace Bgp.Web.Localization;

/// <summary>
/// Custom string localizer that reads the shared resource manifest manually.
/// This bypasses the default ResourceManagerStringLocalizer lookup logic that
/// previously failed to resolve the embedded resources, ensuring translations
/// are always available for the shared strings used across the app.
/// </summary>
public sealed class SharedResourceLocalizer : IStringLocalizer<SharedResource>
{
    private readonly ResourceManager _resourceManager;
    private readonly CultureInfo? _culture;

    private SharedResourceLocalizer(ResourceManager resourceManager, CultureInfo? culture = null)
    {
        _resourceManager = resourceManager;
        _culture = culture;
    }

    public static SharedResourceLocalizer Create()
    {
        var assembly = typeof(Program).Assembly;
        foreach (var baseName in new[] { "Bgp.Web.Resources.SharedResource", "Bgp.Web.SharedResource" })
        {
            try
            {
                var manager = new ResourceManager(baseName, assembly);
                if (manager.GetResourceSet(CultureInfo.InvariantCulture, createIfNotExists: true, tryParents: false) is not null)
                {
                    return new SharedResourceLocalizer(manager);
                }
            }
            catch (MissingManifestResourceException)
            {
                // ignore and try next base name
            }
        }

        // fallback – will still throw at runtime if resources are completely missing
        return new SharedResourceLocalizer(new ResourceManager("Bgp.Web.Resources.SharedResource", assembly));
    }

    public LocalizedString this[string name] => GetLocalizedString(name, Array.Empty<object>());

    public LocalizedString this[string name, params object[] arguments] => GetLocalizedString(name, arguments);

    public IEnumerable<LocalizedString> GetAllStrings(bool includeParentCultures)
    {
        var culture = _culture ?? CultureInfo.CurrentUICulture;
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (var localizedString in EnumerateResourceSet(culture, includeParentCultures))
        {
            if (seen.Add(localizedString.Name))
            {
                yield return localizedString;
            }
        }
    }

    public IStringLocalizer WithCulture(CultureInfo culture) => new SharedResourceLocalizer(_resourceManager, culture);

    private LocalizedString GetLocalizedString(string name, object[] arguments)
    {
        var culture = _culture ?? CultureInfo.CurrentUICulture;
        var rawValue = _resourceManager.GetString(name, culture);
        var resourceNotFound = rawValue is null;
        var value = resourceNotFound
            ? name
            : (arguments.Length > 0 ? string.Format(culture, rawValue, arguments) : rawValue);
        return new LocalizedString(name, value, resourceNotFound);
    }

    private IEnumerable<LocalizedString> EnumerateResourceSet(CultureInfo culture, bool includeParentCultures)
    {
        CultureInfo? current = culture;
        while (current is not null)
        {
            var set = _resourceManager.GetResourceSet(current, createIfNotExists: true, tryParents: false);
            if (set is not null)
            {
                foreach (DictionaryEntry entry in set)
                {
                    var name = entry.Key?.ToString();
                    if (name is null)
                    {
                        continue;
                    }

                    var value = entry.Value?.ToString() ?? string.Empty;
                    yield return new LocalizedString(name, value, resourceNotFound: false);
                }
            }

            if (!includeParentCultures || current.Equals(CultureInfo.InvariantCulture))
            {
                break;
            }

            current = current.Parent;
        }
    }
}