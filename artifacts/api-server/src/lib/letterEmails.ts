import { google } from "googleapis";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env["GOOGLE_CLIENT_ID"],
    process.env["GOOGLE_CLIENT_SECRET"],
    process.env["GOOGLE_REDIRECT_URI"],
  );
}

let cachedAccessToken: string | null = null;
let cachedTokenExpiry: number | null = null;

async function getGmailClient() {
  const refreshToken = process.env["SCHEDULER_GOOGLE_REFRESH_TOKEN"];
  if (!refreshToken) {
    console.warn("SCHEDULER_GOOGLE_REFRESH_TOKEN not set — letter email sending disabled");
    return null;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: cachedAccessToken,
    refresh_token: refreshToken,
    expiry_date: cachedTokenExpiry,
  });

  oauth2Client.on("tokens", (tokens) => {
    if (tokens.access_token) cachedAccessToken = tokens.access_token;
    if (tokens.expiry_date) cachedTokenExpiry = tokens.expiry_date;
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

function encodeMimeMessage(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): string {
  const { to, subject, html, text } = options;
  const boundary = "EleanorLettersBoundary";
  const message = [
    `To: ${to}`,
    `From: Eleanor <eleanorscheduler@gmail.com>`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  return Buffer.from(message).toString("base64url");
}

function wrapHtml(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e8e2d9;padding:40px 36px;">
          <tr>
            <td>
              <div style="margin-bottom:28px;">
                <span style="font-size:22px;font-weight:700;color:#2C1810;letter-spacing:-0.5px;">\u{1F4EE} Eleanor Letters</span>
              </div>
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function linkButton(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#6B8F71;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">${label}</a>`;
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const gmail = await getGmailClient();
  if (!gmail) {
    console.warn("Gmail client unavailable — skipping letter email");
    return false;
  }
  try {
    const raw = encodeMimeMessage({ to, subject, html, text });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return true;
  } catch (err) {
    console.error("Failed to send letter email:", err);
    return false;
  }
}

export async function sendInvitationEmail(opts: {
  to: string;
  creatorName: string;
  correspondenceName: string;
  inviteUrl: string;
}): Promise<boolean> {
  const { to, creatorName, correspondenceName, inviteUrl } = opts;
  const subject = `${creatorName} wants to stay in touch \u2014 Letters \u{1F4EE}`;

  const html = wrapHtml(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2C1810;line-height:1.3;">
      ${creatorName} wants to stay in touch
    </h1>
    <p style="margin:0 0 8px;font-size:15px;color:#6b6460;line-height:1.7;">
      ${creatorName} has invited you to exchange letters on Eleanor.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#6b6460;line-height:1.7;">
      Once every week, you each write one letter. When a letter arrives, you\u2019ll get a calendar notification with a link to read it. Then write back when you\u2019re ready.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.7;">
      A simple practice of staying close. \u{1F33F}
    </p>
    ${linkButton(inviteUrl, `Accept ${creatorName}\u2019s invitation \u2192`)}
    <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
      No account needed. Your link is all you need.
    </p>
  `);

  const text = [
    `${creatorName} wants to stay in touch`,
    "",
    `${creatorName} has invited you to exchange letters on Eleanor.`,
    "",
    "Once every week, you each write one letter. When a letter arrives, you\u2019ll get a calendar notification with a link to read it. Then write back when you\u2019re ready.",
    "",
    "A simple practice of staying close. \u{1F33F}",
    "",
    `Accept ${creatorName}\u2019s invitation:`,
    inviteUrl,
    "",
    "No account needed. Your link is all you need.",
  ].join("\n");

  return sendEmail(to, subject, html, text);
}

export async function sendNewLetterEmail(opts: {
  to: string;
  authorName: string;
  correspondenceName: string;
  correspondenceUrl: string;
}): Promise<boolean> {
  const { to, authorName, correspondenceName, correspondenceUrl } = opts;
  const subject = `${authorName} has written you a letter \u{1F33F}`;

  const html = wrapHtml(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2C1810;line-height:1.3;">
      ${authorName} has written a letter
    </h1>
    <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.7;">
      ${authorName} has written their letter in <em>${correspondenceName}</em>.
      <br>Read it, then write back when you\u2019re ready. \u{1F33F}
    </p>
    ${linkButton(correspondenceUrl, "Read it here \u2192")}
  `);

  const text = [
    `${authorName} has written you a letter \u{1F33F}`,
    "",
    `${authorName} has written their letter in ${correspondenceName}.`,
    "",
    "Read it here:",
    correspondenceUrl,
    "",
    "Then write back when you\u2019re ready. \u{1F33F}",
  ].join("\n");

  return sendEmail(to, subject, html, text);
}

export async function sendReminderEmail(opts: {
  to: string;
  correspondenceName: string;
  writeUrl: string;
  periodEnd: string;
}): Promise<boolean> {
  const { to, correspondenceName, writeUrl, periodEnd } = opts;
  const subject = "Your letter is still unwritten \u{1F33F}";

  const html = wrapHtml(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2C1810;line-height:1.3;">
      Your letter is still unwritten
    </h1>
    <p style="margin:0 0 8px;font-size:15px;color:#6b6460;line-height:1.7;">
      You haven\u2019t written your letter yet in <em>${correspondenceName}</em>.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.7;">
      This period closes on ${periodEnd}. If something is on your mind, now is a good time. \u{1F33F}
    </p>
    ${linkButton(writeUrl, "Write your letter \u2192")}
  `);

  const text = [
    "Your letter is still unwritten \u{1F33F}",
    "",
    `You haven\u2019t written your letter yet in ${correspondenceName}.`,
    "",
    `This period closes on ${periodEnd}. If something is on your mind, now is a good time. \u{1F33F}`,
    "",
    "Write your letter:",
    writeUrl,
  ].join("\n");

  return sendEmail(to, subject, html, text);
}
