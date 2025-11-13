using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bgp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class iniser : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GameId",
                table: "HomeEvents",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImagePath",
                table: "HomeEvents",
                type: "nvarchar(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "StartsAtUtc",
                table: "HomeEvents",
                type: "datetime2",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<int>(
                name: "BonusExperience",
                table: "AspNetUsers",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_HomeEvents_GameId",
                table: "HomeEvents",
                column: "GameId");

            migrationBuilder.AddForeignKey(
                name: "FK_HomeEvents_Games_GameId",
                table: "HomeEvents",
                column: "GameId",
                principalTable: "Games",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_HomeEvents_Games_GameId",
                table: "HomeEvents");

            migrationBuilder.DropIndex(
                name: "IX_HomeEvents_GameId",
                table: "HomeEvents");

            migrationBuilder.DropColumn(
                name: "GameId",
                table: "HomeEvents");

            migrationBuilder.DropColumn(
                name: "ImagePath",
                table: "HomeEvents");

            migrationBuilder.DropColumn(
                name: "StartsAtUtc",
                table: "HomeEvents");

            migrationBuilder.DropColumn(
                name: "BonusExperience",
                table: "AspNetUsers");
        }
    }
}
