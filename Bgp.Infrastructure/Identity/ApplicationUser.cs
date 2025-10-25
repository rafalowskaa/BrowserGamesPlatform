using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;
using Bgp.Domain.Enums;

namespace Bgp.Infrastructure.Identity;

public class ApplicationUser : IdentityUser
{
    public string? DisplayName { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;


    [MaxLength(512)]
    public string? AvatarUrl { get; set; }

    public bool IsBlocked { get; set; }

    [MaxLength(100)]
    public string? FirstName { get; set; }

    [MaxLength(100)]
    public string? LastName { get; set; }

    public DateTime? BirthDate { get; set; }

    public ProfileVisibility DisplayNameVisibility { get; set; } = ProfileVisibility.Everyone;

    public ProfileVisibility FirstNameVisibility { get; set; } = ProfileVisibility.OwnerOnly;

    public ProfileVisibility LastNameVisibility { get; set; } = ProfileVisibility.OwnerOnly;

    public ProfileVisibility BirthDateVisibility { get; set; } = ProfileVisibility.OwnerOnly;

    public ProfileVisibility EmailVisibility { get; set; } = ProfileVisibility.OwnerOnly;
}
