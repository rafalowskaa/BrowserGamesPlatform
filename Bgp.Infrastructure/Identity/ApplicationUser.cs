using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;

namespace Bgp.Infrastructure.Identity;

public class ApplicationUser : IdentityUser
{
    public string? DisplayName { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;


    [MaxLength(512)]
    public string? AvatarUrl { get; set; }
}
