using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Bgp.Web.Models;

namespace Bgp.Web.Helpers;

public static class RankCalculator
{
    private readonly record struct RankStage(string Tier, string? Division, int Threshold);
    private readonly record struct TrophyVisual(string ImagePath, string BaseColor, string HighlightColor);

    public const int MatchWinExperience = 90;
    public const int MatchLossExperience = 10;
    public const int MatchDrawExperience = 50;

    private static readonly IReadOnlyList<RankStage> RankTable = BuildRankTable();
    private static readonly TrophyVisual DefaultTrophyVisual = new("/img/trophies/silver.png", "#94a3b8", "#e2e8f0");
    private static readonly IReadOnlyDictionary<string, TrophyVisual> TrophyVisuals = BuildTrophyVisuals();

    public static ProfileRankViewModel CalculateRank(DashboardStatsViewModel stats)
    {
        var xp = CalculateTotalExperience(stats);

        var currentStage = RankTable[0];
        RankStage? nextStage = null;

        foreach (var stage in RankTable)
        {
            if (xp >= stage.Threshold)
            {
                currentStage = stage;
            }
            else
            {
                nextStage = stage;
                break;
            }
        }

        var nextThreshold = nextStage?.Threshold ?? (currentStage.Threshold + 500);
        var xpIntoCurrent = Math.Max(0, xp - currentStage.Threshold);
        var window = Math.Max(1, nextThreshold - currentStage.Threshold);
        var xpToNext = nextStage is null ? 0 : Math.Max(0, nextThreshold - xp);
        var progress = nextStage is null ? 100 : Math.Clamp((int)Math.Round((double)xpIntoCurrent / window * 100), 0, 100);

        var rank = new ProfileRankViewModel
        {
            Tier = currentStage.Tier,
            Division = currentStage.Division,
            NextTier = nextStage?.Tier,
            NextDivision = nextStage?.Division,
            ExperiencePoints = xp,
            CurrentThreshold = currentStage.Threshold,
            NextThreshold = nextThreshold,
            XpIntoCurrent = xpIntoCurrent,
            XpRequiredForNext = xpToNext,
            ProgressPercent = progress
        };

        return PopulateRankVisuals(rank);
    }

    public static int CalculateExperiencePoints(DashboardStatsViewModel stats) => CalculateTotalExperience(stats);

    public static int CalculateGameExperience(GamePerformanceStat game)
    {
        if (game is null)
        {
            return 0;
        }

        return CalculateGameExperience(game.TotalMatches, game.RankPosition, game.TotalPlayers, game.MatchExperience);
    }

    public static int CalculateGameExperience(int totalMatches, int rankPosition, int totalPlayers)
    {
        return CalculateGameExperience(totalMatches, rankPosition, totalPlayers, 0);
    }

    public static int CalculateGameExperience(int totalMatches, int rankPosition, int totalPlayers, int matchExperience)
    {
        var participants = Math.Max(1, totalPlayers);
        var normalizedRank = Math.Clamp(rankPosition, 1, participants);
        var percentile = participants == 1
            ? 1d
            : 1d - (normalizedRank - 1d) / participants;

        var volumeBoost = Math.Clamp(Math.Log10(totalMatches + 1d) + 0.2d, 0.55d, 1.6d);
        var skillMultiplier = 0.55d + percentile * 0.45d;
        var xp = 85d * skillMultiplier * volumeBoost;
        return Math.Max(0, (int)Math.Round(xp) + Math.Max(0, matchExperience));
    }

    public static int CalculateMatchExperience(int wins, int losses, int draws)
    {
        return Math.Max(0,
            (wins * MatchWinExperience)
            + (losses * MatchLossExperience)
            + (draws * MatchDrawExperience));
    }

    private static int CalculateTotalExperience(DashboardStatsViewModel stats)
    {
        var xpFromGames = 0d;

        foreach (var game in stats.GamePerformances)
        {
            xpFromGames += CalculateGameExperience(game.TotalMatches, game.RankPosition, game.TotalPlayers, game.MatchExperience);
        }

        var engagementXp = stats.UploadedGames * 140
                           + stats.TotalRatings * 35
                           + stats.TotalComments * 20
                           + stats.FriendsCount * 15
                           + stats.MultiplayerMatches * 20
                           + stats.DailyLoginCount * 12;
        var activityXp = Math.Min(stats.TotalScores * 6, 360);
        var dailyXp = Math.Min(Math.Max(stats.DailyGoalsCompleted, 0) * 40, 160);

        var totalXp = xpFromGames + engagementXp + activityXp + dailyXp;

        if (stats.LastScoreSubmittedAt is DateTime lastPlayed)
        {
            var inactivityDays = (DateTime.UtcNow - lastPlayed).TotalDays;
            if (inactivityDays > 5)
            {
                var penalty = Math.Min(totalXp * 0.4d, ((inactivityDays - 5d) / 4d) * 60d);
                totalXp -= penalty;
            }
        }
        else if (totalXp > 0)
        {
            totalXp *= 0.6d;
        }

        if (stats.GamePerformances.Count == 0)
        {
            totalXp -= 120d;
        }

        totalXp += Math.Max(0, stats.BonusExperience);

        return (int)Math.Round(totalXp);
    }

    private static ProfileRankViewModel PopulateRankVisuals(ProfileRankViewModel rank)
    {
        var current = ResolveTrophyVisual(rank.Tier);
        rank.AccentColor = current.BaseColor;
        rank.AccentHighlightColor = current.HighlightColor;
        rank.AccentGlowColor = HexToRgba(current.HighlightColor, 0.45d);
        rank.TrophyImage = current.ImagePath;

        if (!string.IsNullOrWhiteSpace(rank.NextTier))
        {
            var next = ResolveTrophyVisual(rank.NextTier);
            rank.NextAccentColor = next.BaseColor;
            rank.NextAccentHighlightColor = next.HighlightColor;
            rank.NextAccentGlowColor = HexToRgba(next.HighlightColor, 0.45d);
            rank.NextTrophyImage = next.ImagePath;
        }
        else
        {
            rank.NextTrophyImage = null;
            rank.NextAccentColor = null;
            rank.NextAccentHighlightColor = null;
            rank.NextAccentGlowColor = null;
        }

        return rank;
    }

    private static TrophyVisual ResolveTrophyVisual(string? tier)
    {
        if (string.IsNullOrWhiteSpace(tier))
        {
            return DefaultTrophyVisual;
        }

        var key = NormalizeTierKey(tier);
        return TrophyVisuals.TryGetValue(key, out var visual) ? visual : DefaultTrophyVisual;
    }

    private static string NormalizeTierKey(string value)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var ch in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(ch);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (!char.IsWhiteSpace(ch))
            {
                builder.Append(char.ToLowerInvariant(ch));
            }
        }

        return builder.ToString();
    }

    private static string HexToRgba(string hex, double alpha)
    {
        if (string.IsNullOrWhiteSpace(hex))
        {
            return $"rgba(148, 163, 184, {alpha.ToString(CultureInfo.InvariantCulture)})";
        }

        var sanitized = hex.TrimStart('#');
        if (sanitized.Length == 3)
        {
            sanitized = string.Concat(sanitized.Select(c => new string(c, 2)));
        }

        if (sanitized.Length != 6)
        {
            return $"rgba(148, 163, 184, {alpha.ToString(CultureInfo.InvariantCulture)})";
        }

        var r = int.Parse(sanitized[..2], NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        var g = int.Parse(sanitized.Substring(2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        var b = int.Parse(sanitized.Substring(4, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);

        return $"rgba({r}, {g}, {b}, {alpha.ToString(CultureInfo.InvariantCulture)})";
    }

    private static IReadOnlyList<RankStage> BuildRankTable()
    {
        var stages = new List<RankStage>();
        var xp = 0;

        void AddTier(string tier, int step, params string[] divisions)
        {
            if (divisions.Length == 0)
            {
                stages.Add(new RankStage(tier, null, xp));
                xp += step;
                return;
            }

            foreach (var division in divisions)
            {
                stages.Add(new RankStage(tier, division, xp));
                xp += step;
            }
        }

        AddTier("Drewno", 90, "IV", "III", "II", "I");
        AddTier("Brąz", 130, "IV", "III", "II", "I");
        AddTier("Srebro", 170, "IV", "III", "II", "I");
        AddTier("Złoto", 220, "IV", "III", "II", "I");
        AddTier("Platyna", 270, "IV", "III", "II", "I");
        AddTier("Szmaragd", 330, "IV", "III", "II", "I");
        AddTier("Diament", 400, "IV", "III", "II", "I");
        AddTier("Mistrz", 520);
        AddTier("Arcymistrz", 650);
        AddTier("Pretendent", 0);

        return stages;
    }

    private static IReadOnlyDictionary<string, TrophyVisual> BuildTrophyVisuals()
    {
        var visuals = new Dictionary<string, TrophyVisual>
        {
            ["drewno"] = new("/img/trophies/wood.png", "#b45309", "#f59e0b"),
            ["braz"] = new("/img/trophies/bronze.png", "#cd7f32", "#f97316"),
            ["srebro"] = new("/img/trophies/silver.png", "#94a3b8", "#e2e8f0"),
            ["zloto"] = new("/img/trophies/gold.png", "#f59e0b", "#fde68a"),
            ["platyna"] = new("/img/trophies/platinum.png", "#38bdf8", "#5eead4"),
            ["szmaragd"] = new("/img/trophies/emerald.png", "#10b981", "#34d399"),
            ["diament"] = new("/img/trophies/diamond.png", "#60a5fa", "#a855f7"),
            ["mistrz"] = new("/img/trophies/master.png", "#a855f7", "#f472b6"),
            ["arcymistrz"] = new("/img/trophies/grandmaster.png", "#f97316", "#fb7185"),
            ["pretendent"] = new("/img/trophies/challenger.png", "#facc15", "#fbbf24")
        };

        visuals["wood"] = visuals["drewno"];
        visuals["zelazo"] = visuals["drewno"];
        visuals["iron"] = visuals["drewno"];
        visuals["bronze"] = visuals["braz"];
        visuals["silver"] = visuals["srebro"];
        visuals["gold"] = visuals["zloto"];
        visuals["platinum"] = visuals["platyna"];
        visuals["emerald"] = visuals["szmaragd"];
        visuals["diamond"] = visuals["diament"];
        visuals["master"] = visuals["mistrz"];
        visuals["grandmaster"] = visuals["arcymistrz"];
        visuals["challenger"] = visuals["pretendent"];

        return visuals;
    }
}