using System;

namespace Bgp.Domain.Constants;

public static class GameModerationSettings
{
    public static readonly TimeSpan RejectedRetentionPeriod = TimeSpan.FromDays(14);
}