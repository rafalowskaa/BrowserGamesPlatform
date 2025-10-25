using Bgp.Domain.Entities;
using Bgp.Domain.Enums;
using Bgp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Bgp.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<ApplicationUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) 
    { 
    }

    public DbSet<Game> Games => Set<Game>();
    public DbSet<GameVersion> GameVersions => Set<GameVersion>();
    public DbSet<Score> Scores => Set<Score>();
    public DbSet<GameReview> GameReviews => Set<GameReview>();
    public DbSet<MatchSession> MatchSessions => Set<MatchSession>();
    public DbSet<Notification> Notifications => Set<Notification>();

    // NOWE:
    public DbSet<Friendship> Friendships => Set<Friendship>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<Report> Reports => Set<Report>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<Game>()
            .HasIndex(x => x.Slug)
            .IsUnique();

        b.Entity<Game>()
            .Property(x => x.Title)
            .HasMaxLength(120)
            .IsRequired();

        b.Entity<Game>()
            .Property(x => x.ApprovalStatus)
            .HasConversion<int>()
            .HasDefaultValue(GameApprovalStatus.Pending);

        b.Entity<Game>()
            .Property(x => x.ModerationNotes)
            .HasMaxLength(500);

        b.Entity<GameVersion>()
            .HasOne(x => x.Game)
            .WithMany(g => g.Versions)
            .HasForeignKey(x => x.GameId);

        b.Entity<GameReview>()
            .HasOne(x => x.Game)
            .WithMany(g => g.Reviews)
            .HasForeignKey(x => x.GameId);

        b.Entity<Score>()
            .HasOne(x => x.Game)
            .WithMany(g => g.Scores)
            .HasForeignKey(x => x.GameId);

        b.Entity(typeof(Score)).HasIndex(nameof(Score.GameId), nameof(Score.UserId));
        b.Entity(typeof(MatchSession)).HasIndex(nameof(MatchSession.GameId), nameof(MatchSession.UserId));

        // --- Friends / Chat / Reports ---
        b.Entity<Friendship>()
            .HasIndex(x => new { x.RequesterId, x.AddresseeId })
            .IsUnique();

        b.Entity<ChatMessage>()
            .Property(x => x.Content)
            .HasMaxLength(2000);

        b.Entity<ChatMessage>()
            .HasIndex(x => new { x.SenderId, x.ReceiverId, x.SentAtUtc });

        b.Entity<Report>()
            .HasIndex(x => x.CreatedAtUtc);
    }
}
