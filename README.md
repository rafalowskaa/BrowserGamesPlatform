<p align="center">
  <img src="Bgp.Web/wwwroot/img/branding/logo-playgrid.svg" alt="PlayGrid" width="220">
</p>

# PlayGrid · Browser Games Platform

An ASP.NET Core platform for publishing browser games and bringing players together through profiles, rankings, chat and game invitations.

**C# · .NET 8 · ASP.NET Core MVC · Entity Framework Core · SQL Server · SignalR · Unity WebGL**

[Architecture](docs/ARCHITECTURE.md) · [Local setup](#local-setup) · [Tests](#tests) · [More projects](PORTFOLIO.md)

## What the project includes

- A game catalogue with categories, game details and moderated submissions.
- User accounts, profiles and roles built on ASP.NET Core Identity.
- Game sessions, score submission and leaderboards.
- Friends, notifications, invitations and real-time chat through SignalR.
- Ratings, comments, reports and administration views.
- Polish and English localisation.
- Static game hosting, including handling of compressed Unity WebGL assets.

This is a portfolio project under development. The repository includes application code, example game builds and automated tests; it is not a production deployment package.

## Repository map

| Project | Responsibility |
| --- | --- |
| `Bgp.Domain` | Entities, enums and domain abstractions |
| `Bgp.Application` | DTOs and application interfaces |
| `Bgp.Infrastructure` | Persistence, Identity, storage, email and score signing |
| `Bgp.Web` | MVC views, API endpoints, middleware and SignalR hubs |
| `Bgp.Tests` | xUnit tests and integration test infrastructure |
| `e2e` | Playwright browser scenarios |

## Local setup

Requirements: .NET 8 SDK and SQL Server. The checked-in connection string uses SQL Server LocalDB on Windows. For another SQL Server instance, override `ConnectionStrings__DefaultConnection` in your environment.

```bash
git clone https://github.com/rafalowskaa/BrowserGamesPlatform.git
cd BrowserGamesPlatform
dotnet restore Bgp.sln
dotnet build Bgp.sln --configuration Release --no-restore
dotnet run --project Bgp.Web --launch-profile https
```

The HTTPS launch profile uses **https://localhost:7222**. On a development machine, trust the local HTTPS certificate with `dotnet dev-certs https --trust`.

Database migrations run during startup. Automatic administrator creation is disabled by default. For a local administrator, explicitly set `BootstrapAdmin__Enabled=true`, `BootstrapAdmin__UserName`, `BootstrapAdmin__Email` and `BootstrapAdmin__Password` in the process environment before starting the host. The password must satisfy the configured Identity policy. Remove the bootstrap settings after the first successful account creation.

Bootstrap creates a new account only; it does not reset existing passwords, remove blocks or promote an existing regular user.

Configuration sections include `ConnectionStrings`, `Jwt`, `Smtp`, `Branding` and `HomeContent`. Supply real credentials through environment variables or an untracked local configuration file.

## Tests

```bash
dotnet test Bgp.Tests/Bgp.Tests.csproj --configuration Release
```

Browser scenarios target an already running application; Playwright does not start it automatically.

```bash
cd e2e
npm ci
npx playwright install chromium
npx playwright test
```

The default browser test URL is `http://localhost:5024`; override `E2E_BASE_URL` for another local instance. Some scenarios expect prepared users and approved games. The complete MVC registration/login flow and profile-history pages do not yet have dedicated automated tests; the suite does not claim full coverage.

## Demo walkthrough

1. Browse the catalogue and open a game's details.
2. Register a local test account and inspect the profile.
3. Start a game session and inspect its leaderboard.
4. Use separate local accounts to demonstrate social features.
5. Demonstrate submission review and reports with an administrator account.

Use synthetic accounts and a disposable local database for demonstrations.

## Licence

See [LICENSE.txt](LICENSE.txt).
