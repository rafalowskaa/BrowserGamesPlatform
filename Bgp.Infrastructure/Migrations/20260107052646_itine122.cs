using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bgp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class itine122 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_GameReviews_GameId",
                table: "GameReviews");

            migrationBuilder.AlterColumn<string>(
                name: "UserId",
                table: "GameReviews",
                type: "nvarchar(450)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<int>(
                name: "Stars",
                table: "GameReviews",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<bool>(
                name: "IsRating",
                table: "GameReviews",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReplyToReviewId",
                table: "GameReviews",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameReviews_GameId_UserId_IsRating",
                table: "GameReviews",
                columns: new[] { "GameId", "UserId", "IsRating" });

            migrationBuilder.CreateIndex(
                name: "IX_GameReviews_ReplyToReviewId",
                table: "GameReviews",
                column: "ReplyToReviewId");

            migrationBuilder.AddForeignKey(
                name: "FK_GameReviews_GameReviews_ReplyToReviewId",
                table: "GameReviews",
                column: "ReplyToReviewId",
                principalTable: "GameReviews",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GameReviews_GameReviews_ReplyToReviewId",
                table: "GameReviews");

            migrationBuilder.DropIndex(
                name: "IX_GameReviews_GameId_UserId_IsRating",
                table: "GameReviews");

            migrationBuilder.DropIndex(
                name: "IX_GameReviews_ReplyToReviewId",
                table: "GameReviews");

            migrationBuilder.DropColumn(
                name: "IsRating",
                table: "GameReviews");

            migrationBuilder.DropColumn(
                name: "ReplyToReviewId",
                table: "GameReviews");

            migrationBuilder.AlterColumn<string>(
                name: "UserId",
                table: "GameReviews",
                type: "nvarchar(max)",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)");

            migrationBuilder.AlterColumn<int>(
                name: "Stars",
                table: "GameReviews",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldDefaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_GameReviews_GameId",
                table: "GameReviews",
                column: "GameId");
        }
    }
}
