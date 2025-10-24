using Bgp.Domain.Entities;
using Bgp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Game> Games => Set<Game>();
    public DbSet<GameVersion> GameVersions => Set<GameVersion>();
    public DbSet<Score> Scores => Set<Score>();
    public DbSet<GameReview> GameReviews => Set<GameReview>();
    public DbSet<MatchSession> MatchSessions => Set<MatchSession>();
    public DbSet<Notification> Notifications => Set<Notification>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<Game>()
            .HasIndex(x => x.Slug).IsUnique();

        b.Entity<Game>()
            .Property(x => x.Title).HasMaxLength(120).IsRequired();

        b.Entity<GameVersion>()
            .HasOne(x => x.Game).WithMany(g => g.Versions)
            .HasForeignKey(x => x.GameId);

        b.Entity<GameReview>()
            .HasOne(x => x.Game).WithMany(g => g.Reviews)
            .HasForeignKey(x => x.GameId);

        b.Entity<Score>()
            .HasOne(x => x.Game).WithMany(g => g.Scores)
            .HasForeignKey(x => x.GameId);

        b.Entity<Score>().HasIndex(x => new { x.GameId, x.UserId });
        b.Entity<MatchSession>().HasIndex(x => new { x.GameId, x.UserId });
    }
}
