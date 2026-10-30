import nodemailer from "nodemailer";
import chalk from "chalk";

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

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: user,
      pass: pass
    }
  });

  const html = `
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
  `;

  const mailOptions = {
    from: `"Athena Prime Security" <${user}>`,
    to: toEmail,
    subject: `[ACTION REQUIRED] 2FA Code for ${guildName}`,
    html: html
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(chalk.green(`[SMTP Success] 2FA verification email delivered to ${toEmail} (MessageId: ${info.messageId})`));
  return info;
}
