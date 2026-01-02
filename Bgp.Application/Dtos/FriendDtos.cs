using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Application.Dtos;

public record FriendDto(
    string UserId,
    string DisplayName,
    string? UserName,
    string? RankTitle,
    string? AvatarUrl,
    string RankAccentColor,
    FriendshipStatus Status,
    bool OutgoingRequest,
    string? StatusMessage,
    UserPresenceStatus Presence,
    bool IsInvisible,
    int UnreadCount);

public record FriendSearchResultDto(
    string UserId,
    string DisplayName,
    string? UserName,
    string? AvatarUrl,
    FriendshipStatus? Status,
    bool OutgoingRequest);

public class FriendRequestDto
{
    [Required] public string TargetUserId { get; set; } = string.Empty;
}
