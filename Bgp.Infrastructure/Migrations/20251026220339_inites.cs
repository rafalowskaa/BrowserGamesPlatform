using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bgp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class inites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ReadAtUtc",
                table: "ChatMessages",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsInvisible",
                table: "AspNetUsers",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "PresenceStatus",
                table: "AspNetUsers",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "StatusMessage",
                table: "AspNetUsers",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReadAtUtc",
                table: "ChatMessages");

            migrationBuilder.DropColumn(
                name: "IsInvisible",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "PresenceStatus",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "StatusMessage",
                table: "AspNetUsers");
        }
    }
}
