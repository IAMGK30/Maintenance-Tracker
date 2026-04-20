// mailer.js  – email sending via Nodemailer (SMTP / SendGrid / Mailgun)
const nodemailer = require('nodemailer');

/**
 * Build a Nodemailer transporter from saved settings.
 */
const buildTransporter = (settings) => {
  const { emailProvider, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure,
          sendgridKey, mailgunKey, mailgunDomain, senderEmail } = settings;

  if (emailProvider === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: sendgridKey },
    });
  }

  if (emailProvider === 'mailgun') {
    return nodemailer.createTransport({
      host: 'smtp.mailgun.org',
      port: 587,
      secure: false,
      auth: { user: `postmaster@${mailgunDomain}`, pass: mailgunKey },
    });
  }

  // Default: SMTP
  const port = parseInt(smtpPort) || 587;
  const secure = smtpSecure === 'SSL'; // SSL uses port 465, TLS uses STARTTLS on 587
  return nodemailer.createTransport({
    host: smtpHost || 'smtp.gmail.com',
    port,
    secure,
    ...(smtpSecure === 'TLS' ? { requireTLS: true } : {}),
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
  });
};

/**
 * Send one email. Returns { success, messageId?, error? }
 */
const sendEmail = async ({ settings, to, cc, subject, body, replyTo }) => {
  const transporter = buildTransporter(settings);
  const from = `"${settings.senderName}" <${settings.senderEmail}>`;

  const mailOptions = {
    from,
    to,
    ...(cc ? { cc } : {}),
    ...(replyTo || settings.replyTo ? { replyTo: replyTo || settings.replyTo } : {}),
    subject,
    text: body,
    // Also send as basic HTML for nicer formatting
    html: body.replace(/\n/g, '<br>').replace(/ {2,}/g, m => '&nbsp;'.repeat(m.length)),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * Verify SMTP connection (used by /api/settings/test-email).
 */
const testConnection = async (settings) => {
  const transporter = buildTransporter(settings);
  try {
    await transporter.verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

module.exports = { sendEmail, testConnection };
