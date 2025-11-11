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
    public DbSet<GameTag> GameTags => Set<GameTag>();

    public DbSet<Friendship> Friendships => Set<Friendship>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<Report> Reports => Set<Report>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);


        b.Entity<ApplicationUser>()
            .Property(u => u.DisplayNameVisibility)
            .HasConversion<int>()
            .HasDefaultValue(ProfileVisibility.Everyone);

        b.Entity<ApplicationUser>()
            .Property(u => u.BirthDateVisibility)
            .HasConversion<int>()
            .HasDefaultValue(ProfileVisibility.OwnerOnly);

        b.Entity<ApplicationUser>()
            .Property(u => u.BirthDateVisibility)
            .HasConversion<int>()
            .HasDefaultValue(ProfileVisibility.OwnerOnly);

        b.Entity<ApplicationUser>()
            .Property(u => u.PendingDisplayName)
            .HasMaxLength(120);

        b.Entity<ApplicationUser>()
            .Property(u => u.StatusMessage)
            .HasMaxLength(160);

        b.Entity<ApplicationUser>()
            .Property(u => u.PresenceStatus)
            .HasConversion<int>()
            .HasDefaultValue(UserPresenceStatus.Offline);

        b.Entity<ApplicationUser>()
            .Property(u => u.IsInvisible)
            .HasDefaultValue(false);

        b.Entity<ApplicationUser>()
            .Property(u => u.PreferredLanguage)
            .HasMaxLength(10)
            .HasDefaultValue("system");

        b.Entity<ApplicationUser>()
            .Property(u => u.PreferredTheme)
            .HasMaxLength(20)
            .HasDefaultValue("system");

        b.Entity<ApplicationUser>()
            .Property(u => u.EnableEmailNotifications)
            .HasDefaultValue(true);

        b.Entity<ApplicationUser>()
            .Property(u => u.EnableFriendInvites)
            .HasDefaultValue(true);

        b.Entity<Game>()
            .Property(x => x.Categories)
            .HasConversion<int>()
            .HasDefaultValue(GameCategory.None);

        b.Entity<Game>()
            .Property(x => x.ProposedCategories)
            .HasConversion<int>()
            .HasDefaultValue(GameCategory.None);

        b.Entity<Game>()
            .Property(x => x.Modes)
            .HasConversion<int>()
            .HasDefaultValue(GameMode.None);

        b.Entity<Game>()
            .Property(x => x.ProposedModes)
            .HasConversion<int>()
            .HasDefaultValue(GameMode.Singleplayer);

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

        b.Entity<Game>()
            .HasMany(g => g.Tags)
            .WithOne(t => t.Game!)
            .HasForeignKey(t => t.GameId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Entity<GameTag>()
            .Property(t => t.Value)
            .HasMaxLength(40)
            .IsRequired();

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
