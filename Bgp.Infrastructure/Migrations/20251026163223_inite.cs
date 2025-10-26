using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bgp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class inite : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FirstName",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "FirstNameVisibility",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "LastName",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "LastNameVisibility",
                table: "AspNetUsers");

            migrationBuilder.RenameColumn(
                name: "BirthDate",
                table: "AspNetUsers",
                newName: "PendingDisplayNameRequestedAtUtc");

            migrationBuilder.AlterColumn<int>(
                name: "Modes",
                table: "Games",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<int>(
                name: "Categories",
                table: "Games",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ProposedCategories",
                table: "Games",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ProposedModes",
                table: "Games",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AlterColumn<int>(
                name: "EmailVisibility",
                table: "AspNetUsers",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldDefaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "BirthDay",
                table: "AspNetUsers",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BirthMonth",
                table: "AspNetUsers",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DisplayNameLastApprovedAtUtc",
                table: "AspNetUsers",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PendingDisplayName",
                table: "AspNetUsers",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GameTags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    GameId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsApproved = table.Column<bool>(type: "bit", nullable: false),
                    AddedByUserId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ReviewedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameTags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameTags_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameTags_GameId",
                table: "GameTags",
                column: "GameId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameTags");

            migrationBuilder.DropColumn(
                name: "Categories",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "ProposedCategories",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "ProposedModes",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "BirthDay",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "BirthMonth",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DisplayNameLastApprovedAtUtc",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "PendingDisplayName",
                table: "AspNetUsers");

            migrationBuilder.RenameColumn(
                name: "PendingDisplayNameRequestedAtUtc",
                table: "AspNetUsers",
                newName: "BirthDate");

            migrationBuilder.AlterColumn<int>(
                name: "Modes",
                table: "Games",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldDefaultValue: 0);

            migrationBuilder.AlterColumn<int>(
                name: "EmailVisibility",
                table: "AspNetUsers",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<string>(
                name: "FirstName",
                table: "AspNetUsers",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FirstNameVisibility",
                table: "AspNetUsers",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "LastName",
                table: "AspNetUsers",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LastNameVisibility",
                table: "AspNetUsers",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }
    }
}
