using System.ComponentModel.DataAnnotations;
using Bgp.Domain.Enums;

namespace Bgp.Application.Dtos;

public record FriendDto(string UserId, string DisplayName, FriendshipStatus Status, bool OutgoingRequest);

public class FriendRequestDto
{
    [Required] public string TargetUserId { get; set; } = string.Empty;
}
