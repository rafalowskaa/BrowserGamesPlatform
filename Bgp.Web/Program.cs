using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Bgp.Infrastructure.Extensions;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Hubs;
using Bgp.Web.Localization;
using Bgp.Web.Resources;
using Bgp.Web.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Razor;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// Lokalizacja (PL/EN)
builder.Services.AddLocalization(o => o.ResourcesPath = "Resources");
builder.Services.AddSingleton<IStringLocalizer<SharedResource>>(_ => SharedResourceLocalizer.Create());

// MVC + Razor Pages (Identity UI)
builder.Services.AddControllersWithViews()
    .AddViewLocalization(LanguageViewLocationExpanderFormat.Suffix)
    .AddDataAnnotationsLocalization();
builder.Services.AddRazorPages()
    .AddViewLocalization(LanguageViewLocationExpanderFormat.Suffix)
    .AddDataAnnotationsLocalization();

// Infrastruktura (EF, Identity, us³ugi)
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<IPresenceNotifier, PresenceNotifier>();
builder.Services.AddScoped<IChatMessageService, ChatMessageService>();
builder.Services.AddScoped<IGameContentResolver, GameContentResolver>();

// CORS
builder.Services.AddCors(o =>
{
    o.AddPolicy("Games", p => p.AllowAnyHeader().AllowAnyMethod().AllowCredentials().SetIsOriginAllowed(_ => true));
});

// JWT dla API (opcjonalnie)
var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-key-change-me";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "Bgp";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "BgpAudience";

builder.Services.AddAuthentication()
    .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, o =>
    {
        o.TokenValidationParameters = new()
        {
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuerSigningKey = true,
            ValidateIssuer = true,
            ValidateAudience = true
        };
    });

// Swagger
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "BGP API", Version = "v1" });
});

// SignalR (czat)
builder.Services.AddSignalR();


var supportedCultures = new[] { new CultureInfo("pl-PL"), new CultureInfo("en-US") };
builder.Services.Configure<RequestLocalizationOptions>(options =>
{
    options.DefaultRequestCulture = new RequestCulture("pl-PL");
    options.SupportedCultures = supportedCultures;
    options.SupportedUICultures = supportedCultures;
    options.RequestCultureProviders.Insert(0, new CookieRequestCultureProvider());
});

CultureInfo.DefaultThreadCurrentCulture = supportedCultures[0];
CultureInfo.DefaultThreadCurrentUICulture = supportedCultures[0];

var app = builder.Build();

var unityContentTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
{
    [".js"] = "application/javascript",
    [".wasm"] = "application/wasm",
    [".data"] = "application/octet-stream",
    [".json"] = "application/json"
};

var contentTypeProvider = new FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".data"] = "application/octet-stream";
contentTypeProvider.Mappings[".wasm"] = "application/wasm";
contentTypeProvider.Mappings[".unityweb"] = "application/octet-stream";
contentTypeProvider.Mappings[".br"] = "application/octet-stream";
contentTypeProvider.Mappings[".gz"] = "application/octet-stream";

static string? ResolveUnityContentType(string path, IDictionary<string, string> typeMap)
{
    var withoutCompression = Path.GetFileNameWithoutExtension(path);
    if (string.IsNullOrEmpty(withoutCompression))
    {
        return null;
    }

    var originalExtension = Path.GetExtension(withoutCompression);
    if (string.IsNullOrEmpty(originalExtension))
    {
        return null;
    }

    if (typeMap.TryGetValue(originalExtension, out var mapped))
    {
        return mapped;
    }

    return null;
}

static void ApplyUnityResponseHeaders(StaticFileResponseContext context, IDictionary<string, string> typeMap)
{
    var requestPath = context.Context.Request.Path.Value;
    var physicalPath = context.File?.PhysicalPath;
    var path = physicalPath ?? requestPath;

    if (string.IsNullOrEmpty(path))
    {
        return;
    }

    if (path.EndsWith(".br", StringComparison.OrdinalIgnoreCase))
    {
        context.Context.Response.Headers["Content-Encoding"] = "br";
        var contentType = ResolveUnityContentType(path, typeMap);
        if (!string.IsNullOrEmpty(contentType))
        {
            context.Context.Response.ContentType = contentType;
        }
    }
    else if (path.EndsWith(".gz", StringComparison.OrdinalIgnoreCase))
    {
        context.Context.Response.Headers["Content-Encoding"] = "gzip";
        var contentType = ResolveUnityContentType(path, typeMap);
        if (!string.IsNullOrEmpty(contentType))
        {
            context.Context.Response.ContentType = contentType;
        }
    }
    else if (path.EndsWith(".unityweb", StringComparison.OrdinalIgnoreCase))
    {
        var contentType = ResolveUnityContentType(path, typeMap);
        if (!string.IsNullOrEmpty(contentType))
        {
            context.Context.Response.ContentType = contentType;
        }
    }
}

// Migracje + seeding
await AppDbInitializer.MigrateAndSeedAsync(app.Services);

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

var locOpts = app.Services.GetRequiredService<IOptions<RequestLocalizationOptions>>();
app.UseRequestLocalization(locOpts.Value);

app.UseHttpsRedirection();
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = contentTypeProvider,
    OnPrepareResponse = ctx => ApplyUnityResponseHeaders(ctx, unityContentTypes)
});
app.UseRouting();

app.UseCors("Games");

app.UseAuthentication();
app.UseAuthorization();


// Swagger
app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "BGP API v1"));

app.MapRazorPages();

// Hubs
app.MapHub<ChatHub>("/hubs/chat");

// MVC
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
