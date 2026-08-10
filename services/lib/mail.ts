import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

type MailResult = { success: true } | { success: false; error: unknown };

function createTransporter() {
  const options: SMTPTransport.Options = {
    host: process.env.SMTP_HOST || "smtp.ethereal.email",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    auth: {
      user: process.env.SMTP_USER || "ethereal.user@ethereal.email",
      pass: process.env.SMTP_PASS || "ethereal.pass",
    },
  };
  return nodemailer.createTransport(options);
}

// Lazy singleton — avoids connecting at import time when SMTP is unused.
let transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
}

async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<MailResult> {
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || "noreply@nats.com",
      ...options,
    });
    return { success: true };
  } catch (error) {
    console.error(`Error sending email (${options.subject}):`, error);
    return { success: false, error };
  }
}

export async function sendActivationEmail(
  to: string,
  token: string,
  baseUrl: string,
) {
  const activationLink = `${baseUrl}/verify-email?token=${token}`;

  return sendMail({
    to,
    subject: "Activate Your NATS Account",
    html: `
            <h1>Welcome to NATS!</h1>
            <p>Please activate your account by clicking the link below:</p>
            <a href="${activationLink}">Activate my account</a>
            <p>Or copy and paste this link in your browser: <br> ${activationLink}</p>
        `,
  });
}

export async function sendResetPasswordEmail(
  to: string,
  token: string,
  baseUrl: string,
) {
  const resetLink = `${baseUrl}/auth/reset-password?token=${token}`;

  return sendMail({
    to,
    subject: "Reset Your NATS Password",
    html: `
            <h1>Reset Your Password</h1>
            <p>You requested a password reset for your NATS account. Click the link below to set a new password:</p>
            <a href="${resetLink}">Reset Password</a>
            <p>If you didn't request this, you can safely ignore this email.</p>
            <p>Or copy and paste this link in your browser: <br> ${resetLink}</p>
        `,
  });
}
