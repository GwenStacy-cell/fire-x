import nodemailer from "nodemailer";
import chalk from "chalk";
import dns from "node:dns";

// Prefer IPv4 in containerized environments where IPv6 routing can hang
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

// Dedicated production mailer credentials for Athena Prime
const DEFAULT_SMTP_USER = "athenaprime.security@gmail.com";
const DEFAULT_SMTP_PASS = "ugyvrysffjxeutkj";

export async function send2FACode(toEmail, code, guildName) {
  // Always log the 2FA code immediately to the console so the host is never locked out
  console.log(chalk.yellow.bold(`\n======================================================`));
  console.log(chalk.yellow.bold(`[SECURITY 2FA DISPATCH] Guild: ${guildName} | Recipient: ${toEmail}`));
  console.log(chalk.cyan.bold(`[SECURITY 2FA CODE]: >>> ${code} <<<`));
  console.log(chalk.yellow.bold(`======================================================\n`));

  const user = (process.env.GMAIL_USER || process.env.EMAIL_USER || DEFAULT_SMTP_USER).trim();
  const rawPass = (process.env.GMAIL_PASS || process.env.EMAIL_PASS || DEFAULT_SMTP_PASS).trim();
  const pass = rawPass.replace(/\s+/g, '');

  const mailOptions = {
    from: `"Athena Prime Security" <${user}>`,
    to: toEmail,
    subject: `Athena Prime 2FA Code: ${code} (${guildName})`,
    text: `Athena Prime Security Alert\n\nA critical security authorization was requested in ${guildName}.\n\nYour 2FA verification code is: ${code}\n\nEnter this code into Discord to authorize the action.\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #333; border-radius: 10px; background-color: #1a1a1a; color: #fff;">
        <h2 style="color: #ff4747; text-align: center;">Athena Prime Security Alert</h2>
        <p style="font-size: 16px;">A critical security action was requested in <strong>${guildName}</strong>.</p>
        <p style="font-size: 16px;">To authorize this action, please enter the following 2FA code in Discord:</p>
        <div style="background-color: #2b2d31; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #5865F2;">${code}</span>
        </div>
        <p style="font-size: 14px; color: #999;">If you did not request this, your Discord account may be compromised. Ignore this email and the action will remain blocked.</p>
        <hr style="border-color: #333; margin-top: 30px;" />
        <p style="font-size: 12px; color: #666; text-align: center;">Athena Prime Defense Matrix &bull; Automated Security Dispatch</p>
      </div>
    `
  };

  // Primary: Direct SSL on port 465
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });

    const info = await transporter.sendMail(mailOptions);
    console.log(chalk.green(`[SMTP Success] 2FA verification email delivered via SSL 465 to ${toEmail} (MessageId: ${info.messageId})`));
    return info;
  } catch (sslErr) {
    console.warn(chalk.yellow(`[SMTP Warning] Port 465 failed (${sslErr.message}), falling back to port 587 STARTTLS...`));

    // Fallback: Port 587 STARTTLS
    try {
      const starttlsTransporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });

      const info = await starttlsTransporter.sendMail(mailOptions);
      console.log(chalk.green(`[SMTP Success] 2FA verification email delivered via Port 587 to ${toEmail}`));
      return info;
    } catch (starttlsErr) {
      console.warn(chalk.yellow(`[SMTP Warning] Port 587 failed (${starttlsErr.message}), attempting service 'gmail'...`));

      // Final fallback: standard nodemailer service mapping
      const serviceTransporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass }
      });
      const info = await serviceTransporter.sendMail(mailOptions);
      console.log(chalk.green(`[SMTP Success] 2FA verification email delivered via service 'gmail' to ${toEmail}`));
      return info;
    }
  }
}
