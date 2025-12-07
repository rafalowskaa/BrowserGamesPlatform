using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bgp.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class initing1 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttachmentName",
                table: "ChatMessages",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AttachmentUrl",
                table: "ChatMessages",
                type: "nvarchar(2048)",
                maxLength: 2048,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttachmentName",
                table: "ChatMessages");

            migrationBuilder.DropColumn(
                name: "AttachmentUrl",
                table: "ChatMessages");
        }
    }
}
