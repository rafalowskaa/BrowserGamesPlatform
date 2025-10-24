namespace Bgp.Domain.Enums;

[Flags]
public enum GameMode
{
    None = 0,
    Singleplayer = 1,
    MultiplayerRealtime = 2,
    MultiplayerAsync = 4
}
