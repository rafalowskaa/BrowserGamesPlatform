using System.Globalization;
using System.Text;
using Bgp.Infrastructure.Extensions;
using Bgp.Infrastructure.Persistence;
using Bgp.Web.Hubs;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Razor;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// Lokalizacja (PL/EN)
builder.Services.AddLocalization(o => o.ResourcesPath = "Resources");

// MVC + Razor Pages (Identity UI)
builder.Services.AddControllersWithViews()
    .AddViewLocalization(LanguageViewLocationExpanderFormat.Suffix)
    .AddDataAnnotationsLocalization();
builder.Services.AddRazorPages()
    .AddViewLocalization(LanguageViewLocationExpanderFormat.Suffix)
    .AddDataAnnotationsLocalization();

// Infrastruktura (EF, Identity, us³ugi)
builder.Services.AddInfrastructure(builder.Configuration);

// CORS
builder.Services.AddCors(o =>
{
    o.AddPolicy("Games", p => p.AllowAnyHeader().AllowAnyMethod().AllowCredentials().SetIsOriginAllowed(_ => true));
});

// JWT dla API (opcjonalnie)
var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-key-change-me";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "Bgp";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "BgpAudience";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = IdentityConstants.ApplicationScheme;
    options.DefaultChallengeScheme = IdentityConstants.ApplicationScheme;
})
    .AddCookie(IdentityConstants.ApplicationScheme)
    .AddCookie(IdentityConstants.ExternalScheme)
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
app.UseStaticFiles();
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
