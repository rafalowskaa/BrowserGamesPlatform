# PlayGrid architecture

The solution separates domain types, application contracts, infrastructure and web delivery.

| Layer | Examples | Purpose |
| --- | --- | --- |
| Domain | `Game`, `MatchSession`, `Score`, `Friendship` | Persistent business concepts and state |
| Application | DTOs, `IFileStorage`, `IScoreSigner` | Contracts used across project boundaries |
| Infrastructure | `AppDbContext`, Identity, SMTP, local storage | Concrete integrations and persistence |
| Web | Controllers, Razor views, middleware, hubs | HTTP requests, UI and real-time communication |

## Request flow

MVC and API controllers use persistence and application services to read or update domain entities. Entity Framework Core persists application data in SQL Server. ASP.NET Core Identity handles accounts and roles. SignalR exposes chat and invitation hubs.

The web host runs database migrations and initialisation during startup. This has operational consequences: database access is required before the site can serve requests.

## Game delivery

Example game packages live in `Bgp.Web/wwwroot/games`. The host configures MIME types and compression headers for Unity WebGL outputs, including Brotli, gzip and Unity-specific extensions. These are distributable game assets, not disposable .NET build folders.

## Testing boundaries

`Bgp.Tests` contains xUnit tests and an integration test factory using SQLite. `e2e` contains Playwright scenarios against an independently running host.

These approaches exercise different database providers. A successful SQLite test run alone does not establish SQL Server migration compatibility.

## Before an external deployment

Administrator bootstrap is disabled by default and requires explicit local configuration. The source still contains a development JWT key and permissive game CORS settings. Review those settings, credentials and game-upload boundaries before deployment. Example builds and uploaded content should also be reviewed for redistribution rights.

No production readiness or full test-coverage claim is made by this documentation.
