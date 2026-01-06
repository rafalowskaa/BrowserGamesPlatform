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
    public DbSet<GameLocale> GameLocales => Set<GameLocale>();
    public DbSet<GameAsset> GameAssets => Set<GameAsset>();
    public DbSet<GameInvite> GameInvites => Set<GameInvite>();
    public DbSet<SessionPlayer> SessionPlayers => Set<SessionPlayer>();
    public DbSet<HomeFact> HomeFacts => Set<HomeFact>();
    public DbSet<HomeEvent> HomeEvents => Set<HomeEvent>();
    public DbSet<HomeFeaturedGame> HomeFeaturedGames => Set<HomeFeaturedGame>();
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
            .HasMaxLength(80);

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

        b.Entity<ApplicationUser>()
            .Property(u => u.BonusExperience)
            .HasDefaultValue(0);

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
           .Property(x => x.DefaultLocale)
           .HasMaxLength(10)
           .HasDefaultValue("en-US");

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

        b.Entity<GameLocale>()
            .HasIndex(x => new { x.GameId, x.Locale })
            .IsUnique();

        b.Entity<GameLocale>()
            .Property(x => x.Locale)
            .HasMaxLength(10)
            .IsRequired();

        b.Entity<GameLocale>()
            .Property(x => x.Title)
            .HasMaxLength(160)
            .IsRequired();

        b.Entity<GameAsset>()
            .Property(x => x.Type)
            .HasConversion<int>()
            .IsRequired();

        b.Entity<GameAsset>()
            .Property(x => x.Url)
            .HasMaxLength(1024)
            .IsRequired();

        b.Entity<GameAsset>()
            .HasIndex(x => new { x.GameId, x.Type, x.Locale, x.SortOrder });

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
        b.Entity<MatchSession>()
            .Property(x => x.Mode)
            .HasConversion<int>();
        b.Entity<MatchSession>()
            .Property(x => x.Token)
            .HasMaxLength(128)
            .IsRequired();
        b.Entity<MatchSession>()
            .Property(x => x.WsUrl)
            .HasMaxLength(256);

        b.Entity<SessionPlayer>()
            .HasIndex(x => new { x.SessionId, x.UserId })
            .IsUnique();

        b.Entity<SessionPlayer>()
            .Property(x => x.Role)
            .HasMaxLength(24)
            .HasDefaultValue("player");

        b.Entity<GameInvite>()
            .Property(x => x.Status)
            .HasConversion<int>();

        b.Entity<GameInvite>()
            .HasIndex(x => new { x.SessionId, x.ToUserId, x.Status });


        b.Entity<Friendship>()
            .HasIndex(x => new { x.RequesterId, x.AddresseeId })
            .IsUnique();

        b.Entity<ChatMessage>()
            .Property(x => x.Content)
            .HasMaxLength(2000);

        b.Entity<ChatMessage>()
            .HasIndex(x => new { x.SenderId, x.ReceiverId, x.SentAtUtc });

        b.Entity<ChatMessage>()
           .Property(x => x.DeletedById)
           .HasMaxLength(450);

        b.Entity<ChatMessage>()
          .Property(x => x.Reaction)
          .HasMaxLength(16);

        b.Entity<Report>()
            .HasIndex(x => x.CreatedAtUtc);
        b.Entity<HomeFact>()
          .Property(x => x.Content)
          .HasMaxLength(280)
          .IsRequired();

        b.Entity<HomeFact>()
        .Property(x => x.IsActive)
        .HasDefaultValue(true);

        b.Entity<HomeFact>()
        .Property(x => x.SortOrder)
        .HasDefaultValue(0);

        b.Entity<HomeFact>()
        .Property(x => x.CreatedAtUtc)
        .HasDefaultValueSql("GETUTCDATE()");

        b.Entity<HomeEvent>()
        .Property(x => x.Title)
        .HasMaxLength(160)
        .IsRequired();

        b.Entity<HomeEvent>()
        .Property(x => x.Reward)
        .HasMaxLength(160)
        .IsRequired();

        b.Entity<HomeEvent>()
        .Property(x => x.IsActive)
        .HasDefaultValue(true);

        b.Entity<HomeEvent>()
        .Property(x => x.SortOrder)
        .HasDefaultValue(0);

        b.Entity<HomeEvent>()
        .Property(x => x.CreatedAtUtc)
        .HasDefaultValueSql("GETUTCDATE()");

        b.Entity<HomeEvent>()
        .Property(x => x.EndsAtUtc)
        .HasColumnType("datetime2");

        b.Entity<HomeEvent>()
        .Property(x => x.StartsAtUtc)
        .HasColumnType("datetime2");

        b.Entity<HomeEvent>()
        .Property(x => x.ImagePath)
        .HasMaxLength(512);

        b.Entity<HomeEvent>()
        .HasOne(x => x.Game)
        .WithMany()
        .HasForeignKey(x => x.GameId)
        .OnDelete(DeleteBehavior.SetNull);

        b.Entity<HomeFeaturedGame>()
            .Property(x => x.CustomDescription)
            .HasMaxLength(600);

        b.Entity<HomeFeaturedGame>()
            .Property(x => x.StartsAtUtc)
            .HasColumnType("datetime2");

        b.Entity<HomeFeaturedGame>()
            .Property(x => x.EndsAtUtc)
            .HasColumnType("datetime2");

        b.Entity<HomeFeaturedGame>()
            .Property(x => x.CreatedAtUtc)
            .HasDefaultValueSql("GETUTCDATE()");

        b.Entity<HomeFeaturedGame>()
            .Property(x => x.IsActive)
            .HasDefaultValue(true);

        b.Entity<HomeFeaturedGame>()
            .HasIndex(x => new { x.IsActive, x.StartsAtUtc, x.EndsAtUtc });

        b.Entity<HomeFeaturedGame>()
            .HasOne<Game>()
            .WithMany()
            .HasForeignKey(x => x.GameId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
