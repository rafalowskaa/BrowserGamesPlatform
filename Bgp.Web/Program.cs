using System.Text;
using Bgp.Infrastructure.Extensions;
using Bgp.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.OpenApi.Models;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// MVC + Razor Pages (Identity UI)
builder.Services.AddControllersWithViews();
builder.Services.AddRazorPages();

// Infrastruktura (EF, Identity, us³ugi)
builder.Services.AddInfrastructure(builder.Configuration);

// CORS dla gier (jeœli hostowane na innych domenach)
builder.Services.AddCors(o =>
{
    o.AddPolicy("Games", p => p.AllowAnyHeader().AllowAnyMethod().AllowCredentials().SetIsOriginAllowed(_ => true));
});

// JWT dla API (opcjonalnie; UI u¿ywa cookies/Identity)
var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-key-change-me";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "Bgp";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "BgpAudience";

builder.Services.AddAuthentication()
    .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuerSigningKey = true,
            ValidateIssuer = true,
            ValidateAudience = true
        };
    });

builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "BGP API", Version = "v1" });
});

var app = builder.Build();

// Migracje + seeding (dev)
await AppDbInitializer.MigrateAndSeedAsync(app.Services);

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

app.UseCors("Games");

app.UseAuthentication();
app.UseAuthorization();

// Swagger (równie¿ przydatny dla zespo³u)
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "BGP API v1");
});

app.MapRazorPages();
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
