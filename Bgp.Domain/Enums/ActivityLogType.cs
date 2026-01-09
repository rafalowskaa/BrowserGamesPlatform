namespace Bgp.Domain.Enums;

public enum ActivityLogType
{
    Unknown = 0,
    FriendRequestSent = 1,
    FriendRequestAccepted = 2,
    FriendRequestDeclined = 3,
    FriendBlocked = 4,
    FriendUnblocked = 5,
    CommentAdded = 6,
    CommentDeleted = 7,
    CommentLiked = 8,
    CommentDisliked = 9,
    RatingSubmitted = 10,
    GameInviteSent = 11,
    GameInviteAccepted = 12,
    GameSessionCreated = 13,
    ReportUpdated = 14,
    AdminAction = 15,
    DailyLogin = 16,
    MessageReceived = 17,
    HomeContentUpdated = 18,
    ExperienceGained = 19,
    NewEventAvailable = 20
}