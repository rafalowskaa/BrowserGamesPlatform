using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bgp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class inits3 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "BirthDate",
                table: "AspNetUsers",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BirthYear",
                table: "AspNetUsers",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityQuestion1AnswerHash",
                table: "AspNetUsers",
                type: "nvarchar(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityQuestion1CustomPrompt",
                table: "AspNetUsers",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityQuestion1Key",
                table: "AspNetUsers",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityQuestion2AnswerHash",
                table: "AspNetUsers",
                type: "nvarchar(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityQuestion2CustomPrompt",
                table: "AspNetUsers",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityQuestion2Key",
                table: "AspNetUsers",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityQuestion3AnswerHash",
                table: "AspNetUsers",
                type: "nvarchar(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityQuestion3CustomPrompt",
                table: "AspNetUsers",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityQuestion3Key",
                table: "AspNetUsers",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BirthDate",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "BirthYear",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SecurityQuestion1AnswerHash",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SecurityQuestion1CustomPrompt",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SecurityQuestion1Key",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SecurityQuestion2AnswerHash",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SecurityQuestion2CustomPrompt",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SecurityQuestion2Key",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SecurityQuestion3AnswerHash",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SecurityQuestion3CustomPrompt",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SecurityQuestion3Key",
                table: "AspNetUsers");
        }
    }
}
