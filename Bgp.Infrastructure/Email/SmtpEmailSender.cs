using System.Net;
using System.Net.Mail;
using Bgp.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace Bgp.Infrastructure.Email;

public class SmtpEmailSender : IEmailSender
{
    private readonly IConfiguration _cfg;

    public SmtpEmailSender(IConfiguration cfg) => _cfg = cfg;

    public async Task SendAsync(string toEmail, string subject, string htmlBody, CancellationToken ct = default)
    {
        var host = _cfg["Smtp:Host"];
        var user = _cfg["Smtp:User"];
        var pass = _cfg["Smtp:Pass"];
        var from = _cfg["Smtp:From"] ?? user;

        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass))
            return; // w dev: pomijamy wysyłkę

        using var client = new SmtpClient(host)
        {
            Port = int.TryParse(_cfg["Smtp:Port"], out var p) ? p : 587,
            EnableSsl = true,
            Credentials = new NetworkCredential(user, pass)
        };

        var mail = new MailMessage(from!, toEmail, subject, htmlBody) { IsBodyHtml = true };
        await client.SendMailAsync(mail, ct);
    }
}
