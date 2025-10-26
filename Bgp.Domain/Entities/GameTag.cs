namespace Bgp.Domain.Enums;

[Flags]
public enum GameCategory
{
    None = 0,
    Shooter = 1 << 0,
    Racing = 1 << 1,
    Puzzle = 1 << 2,
    Strategy = 1 << 3,
    Adventure = 1 << 4,
    Platformer = 1 << 5,
    Sports = 1 << 6,
    Simulation = 1 << 7,
    Rpg = 1 << 8,
    Arcade = 1 << 9,
    Educational = 1 << 10,
    Horror = 1 << 11,
    Music = 1 << 12,
    Card = 1 << 13,
    Board = 1 << 14,
    Sandbox = 1 << 15,
    Fighting = 1 << 16,
    Survival = 1 << 17,
    Indie = 1 << 18
}