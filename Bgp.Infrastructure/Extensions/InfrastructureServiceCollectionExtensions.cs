using Bgp.Application.Interfaces;
using Bgp.Infrastructure.Email;
using Bgp.Infrastructure.Identity;
using Bgp.Infrastructure.Persistence;
using Bgp.Infrastructure.Security;
using Bgp.Infrastructure.Storage;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Bgp.Infrastructure.Extensions;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration cfg)
    {
        var cs = cfg.GetConnectionString("DefaultConnection")
                 ?? "Server=(localdb)\\MSSQLLocalDB;Database=BgpDb;Trusted_Connection=True;MultipleActiveResultSets=true";

        services.AddDbContext<AppDbContext>(o => o.UseSqlServer(cs));

        services.AddIdentity<ApplicationUser, IdentityRole>(o =>
        {
            o.Password.RequiredLength = 8;
            o.Password.RequireNonAlphanumeric = false;
            o.Password.RequireUppercase = false;
            o.Password.RequireDigit = false;
            o.User.RequireUniqueEmail = true;
        })
        .AddEntityFrameworkStores<AppDbContext>()
        .AddDefaultTokenProviders()
        .AddDefaultUI(); // UI do logowania/rejestracji

        services.AddScoped<IFileStorage, FileStorageLocal>();
        services.AddScoped<IEmailSender, SmtpEmailSender>();
        services.AddSingleton<IScoreSigner, HmacScoreSigner>();
        services.AddSingleton<IDateTimeProvider, SystemDateTimeProvider>();

        return services;
    }
}

public class SystemDateTimeProvider : Bgp.Application.Interfaces.IDateTimeProvider
{
    public DateTime UtcNow => DateTime.UtcNow;
}
