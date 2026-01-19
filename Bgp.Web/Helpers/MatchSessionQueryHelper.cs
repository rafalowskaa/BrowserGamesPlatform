using System;
using System.Linq;
using Bgp.Infrastructure.Persistence;

namespace Bgp.Web.Helpers;

public static class MatchSessionQueryHelper
{
    private static readonly string[] CompletedRoles = { "winner", "loser", "draw" };

    public static IQueryable<Guid> BuildCompletedSessionIds(AppDbContext db)
    {
        var completedByRole = db.SessionPlayers
            .Where(player => CompletedRoles.Contains(player.Role))
            .Select(player => player.SessionId);

        return db.MatchSessions
            .Where(session => session.Used)
            .Select(session => session.Id)
            .Union(completedByRole)
            .Distinct();
    }
}