using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bgp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class iitiit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "EphemeralKey",
                table: "MatchSessions",
                newName: "Token");

            migrationBuilder.AddColumn<int>(
                name: "Mode",
                table: "MatchSessions",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "WsUrl",
                table: "MatchSessions",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultLocale",
                table: "Games",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "en-US");

            migrationBuilder.CreateTable(
                name: "GameAssets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GameId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    Locale = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    Url = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameAssets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameAssets_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GameInvites",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FromUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    ToUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    RespondedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Mode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameInvites", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GameLocales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GameId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Locale = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    RulesContent = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameLocales", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameLocales_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SessionPlayers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    Role = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false, defaultValue: "player"),
                    JoinedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SessionPlayers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameAssets_GameId_Type_Locale_SortOrder",
                table: "GameAssets",
                columns: new[] { "GameId", "Type", "Locale", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_GameInvites_SessionId_ToUserId_Status",
                table: "GameInvites",
                columns: new[] { "SessionId", "ToUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_GameLocales_GameId_Locale",
                table: "GameLocales",
                columns: new[] { "GameId", "Locale" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SessionPlayers_SessionId_UserId",
                table: "SessionPlayers",
                columns: new[] { "SessionId", "UserId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameAssets");

            migrationBuilder.DropTable(
                name: "GameInvites");

            migrationBuilder.DropTable(
                name: "GameLocales");

            migrationBuilder.DropTable(
                name: "SessionPlayers");

            migrationBuilder.DropColumn(
                name: "Mode",
                table: "MatchSessions");

            migrationBuilder.DropColumn(
                name: "WsUrl",
                table: "MatchSessions");

            migrationBuilder.DropColumn(
                name: "DefaultLocale",
                table: "Games");

            migrationBuilder.RenameColumn(
                name: "Token",
                table: "MatchSessions",
                newName: "EphemeralKey");
        }
    }
}
