using System.Collections.Generic;
using Bgp.Domain.Enums;

namespace Bgp.Web.Helpers;

public static class GameMetadataOptions
{
    public static readonly IReadOnlyList<(GameCategory Category, string ResourceKey)> CategoryDefinitions = new List<(GameCategory, string)>
    {
        (GameCategory.Shooter, "Dashboard_Games_Category_Shooter"),
        (GameCategory.Racing, "Dashboard_Games_Category_Racing"),
        (GameCategory.Puzzle, "Dashboard_Games_Category_Puzzle"),
        (GameCategory.Strategy, "Dashboard_Games_Category_Strategy"),
        (GameCategory.Adventure, "Dashboard_Games_Category_Adventure"),
        (GameCategory.Platformer, "Dashboard_Games_Category_Platformer"),
        (GameCategory.Sports, "Dashboard_Games_Category_Sports"),
        (GameCategory.Simulation, "Dashboard_Games_Category_Simulation"),
        (GameCategory.Rpg, "Dashboard_Games_Category_Rpg"),
        (GameCategory.Arcade, "Dashboard_Games_Category_Arcade"),
        (GameCategory.Educational, "Dashboard_Games_Category_Educational"),
        (GameCategory.Horror, "Dashboard_Games_Category_Horror"),
        (GameCategory.Music, "Dashboard_Games_Category_Music"),
        (GameCategory.Card, "Dashboard_Games_Category_Card"),
        (GameCategory.Board, "Dashboard_Games_Category_Board"),
        (GameCategory.Sandbox, "Dashboard_Games_Category_Sandbox"),
        (GameCategory.Fighting, "Dashboard_Games_Category_Fighting"),
        (GameCategory.Survival, "Dashboard_Games_Category_Survival"),
        (GameCategory.Indie, "Dashboard_Games_Category_Indie")
    };

    public static readonly IReadOnlyList<(GameMode Mode, string ResourceKey)> ModeDefinitions = new List<(GameMode, string)>
    {
        (GameMode.Singleplayer, "Dashboard_Games_Mode_Singleplayer"),
        (GameMode.MultiplayerRealtime, "Dashboard_Games_Mode_MultiplayerRealtime"),
        (GameMode.MultiplayerAsync, "Dashboard_Games_Mode_MultiplayerAsync")
    };
}