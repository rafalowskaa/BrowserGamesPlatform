using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bgp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class initr : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AdminLogDismissals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActivityLogId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeletedByUserId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdminLogDismissals", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "NotificationDismissals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ActivityLogId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NotificationDismissals", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AdminLogDismissals");

            migrationBuilder.DropTable(
                name: "NotificationDismissals");
        }
    }
}
