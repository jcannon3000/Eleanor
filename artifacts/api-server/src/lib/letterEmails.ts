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
  const boundary = "PhoebeLettersBoundary";
  const message = [
    `To: ${to}`,
    `From: Phoebe <eleanorscheduler@gmail.com>`,
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
                <span style="font-size:22px;font-weight:700;color:#2C1810;letter-spacing:-0.5px;">📮 Phoebe</span>
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
  type?: "one_to_one" | "group";
}): Promise<boolean> {
  const { to, creatorName, correspondenceName, inviteUrl, type = "one_to_one" } = opts;

  if (type === "group") {
    const subject = `${creatorName} invited you to ${correspondenceName}`;
    const html = wrapHtml(`
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2C1810;line-height:1.3;">
        ${creatorName} invited you to ${correspondenceName}
      </h1>
      <p style="margin:0 0 8px;font-size:15px;color:#6b6460;line-height:1.7;">
        ${creatorName} has invited you to share weekly updates in <em>${correspondenceName}</em> on Phoebe.
      </p>
      <p style="margin:0 0 8px;font-size:15px;color:#6b6460;line-height:1.7;">
        Once a week, everyone shares what's been happening — 50 words or more. A simple practice of staying in each other's lives.
      </p>
      <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.7;">
        No account needed. 🌿
      </p>
      ${linkButton(inviteUrl, `Accept the invitation →`)}
      <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
        Be together with Phoebe.
      </p>
    `);
    const text = [
      `${creatorName} invited you to ${correspondenceName}`,
      "",
      `${creatorName} has invited you to share weekly updates in ${correspondenceName} on Phoebe.`,
      "",
      "Once a week, everyone shares what's been happening — 50 words or more. A simple practice of staying in each other's lives.",
      "",
      "No account needed. 🌿",
      "",
      `Accept the invitation:`,
      inviteUrl,
      "",
      "Be together with Phoebe.",
    ].join("\n");
    return sendEmail(to, subject, html, text);
  }

  const subject = `${creatorName} wants to stay in touch`;
  const html = wrapHtml(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2C1810;line-height:1.3;">
      ${creatorName} wants to stay in touch
    </h1>
    <p style="margin:0 0 8px;font-size:15px;color:#6b6460;line-height:1.7;">
      ${creatorName} has invited you to exchange letters with them on Phoebe.
    </p>
    <p style="margin:0 0 8px;font-size:15px;color:#6b6460;line-height:1.7;">
      Once every two weeks, you each write one letter — sharing what's been happening, what's on your mind, what matters. You write one week. They respond the next. A conversation with room to breathe.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.7;">
      No account needed. Just your words. 🌿
    </p>
    ${linkButton(inviteUrl, `Accept ${creatorName}'s invitation →`)}
    <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
      Be together with Phoebe.
    </p>
  `);

  const text = [
    `${creatorName} wants to stay in touch`,
    "",
    `${creatorName} has invited you to exchange letters with them on Phoebe.`,
    "",
    "Once every two weeks, you each write one letter — sharing what's been happening, what's on your mind, what matters. You write one week. They respond the next. A conversation with room to breathe.",
    "",
    "No account needed. Just your words. 🌿",
    "",
    `Accept ${creatorName}'s invitation:`,
    inviteUrl,
    "",
    "Be together with Phoebe.",
  ].join("\n");

  return sendEmail(to, subject, html, text);
}

export async function sendNewLetterEmail(opts: {
  to: string;
  authorName: string;
  correspondenceName: string;
  correspondenceUrl: string;
  postmarkCity?: string;
  letterDate?: Date;
  type?: "one_to_one" | "group";
}): Promise<boolean> {
  const { to, authorName, correspondenceName, correspondenceUrl, postmarkCity, letterDate, type = "one_to_one" } = opts;

  if (type === "group") {
    const subject = `${authorName} shared an update 🌿`;
    const html = wrapHtml(`
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2C1810;line-height:1.3;">
        ${authorName} shared an update
      </h1>
      <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.7;">
        ${authorName} has shared their weekly update in <em>${correspondenceName}</em>.
      </p>
      ${linkButton(correspondenceUrl, "Read it here →")}
      <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
        Be together with Phoebe.
      </p>
    `);
    const text = [
      `${authorName} shared an update 🌿`,
      "",
      `${authorName} has shared their weekly update in ${correspondenceName}.`,
      "",
      "Read it here:",
      correspondenceUrl,
      "",
      "Be together with Phoebe.",
    ].join("\n");
    return sendEmail(to, subject, html, text);
  }

  const dateStr = letterDate
    ? letterDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";
  const postmarkLine = postmarkCity ? `Postmarked: ${postmarkCity}${dateStr ? ` · ${dateStr}` : ""}` : "";

  const subject = `${authorName} wrote you a letter 🌿`;
  const html = wrapHtml(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2C1810;line-height:1.3;">
      ${authorName} wrote you a letter
    </h1>
    ${postmarkLine ? `<p style="margin:0 0 8px;font-size:14px;color:#9a9390;line-height:1.6;">${postmarkLine}</p>` : ""}
    <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.7;">
      Read it, then write back when it's your turn. 🌿
    </p>
    ${linkButton(correspondenceUrl, "Read it here →")}
    <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
      Be together with Phoebe.
    </p>
  `);

  const text = [
    `${authorName} wrote you a letter 🌿`,
    "",
    postmarkLine,
    "",
    "Read it here:",
    correspondenceUrl,
    "",
    "Then write back when it's your turn. 🌿",
    "",
    "Be together with Phoebe.",
  ].filter(l => l !== undefined).join("\n");

  return sendEmail(to, subject, html, text);
}

export async function sendReminderEmail(opts: {
  to: string;
  correspondenceName: string;
  writeUrl: string;
  periodEnd: string;
  otherPersonName?: string;
  type?: "one_to_one" | "group";
}): Promise<boolean> {
  const { to, correspondenceName, writeUrl, periodEnd, otherPersonName, type = "one_to_one" } = opts;

  if (type === "group") {
    const subject = "Share your update this week 🌿";
    const html = wrapHtml(`
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2C1810;line-height:1.3;">
        Share your update this week
      </h1>
      <p style="margin:0 0 8px;font-size:15px;color:#6b6460;line-height:1.7;">
        You haven't shared your weekly update in <em>${correspondenceName}</em> yet.
      </p>
      <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.7;">
        50 words or more. What's been happening?
      </p>
      ${linkButton(writeUrl, "Share your update →")}
      <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
        Be together with Phoebe.
      </p>
    `);
    const text = [
      "Share your update this week 🌿",
      "",
      `You haven't shared your weekly update in ${correspondenceName} yet.`,
      "",
      "50 words or more. What's been happening?",
      "",
      "Share your update:",
      writeUrl,
      "",
      "Be together with Phoebe.",
    ].join("\n");
    return sendEmail(to, subject, html, text);
  }

  const subject = "Your letter is waiting to be written 🌿";
  const html = wrapHtml(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#2C1810;line-height:1.3;">
      Your letter is waiting to be written
    </h1>
    <p style="margin:0 0 8px;font-size:15px;color:#6b6460;line-height:1.7;">
      It's your turn to write in <em>${correspondenceName}</em>.
      ${otherPersonName ? `${otherPersonName} is waiting to hear from you.` : ""}
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#6b6460;line-height:1.7;">
      This period closes ${periodEnd}. 🌿
    </p>
    ${linkButton(writeUrl, "Write your letter →")}
    <p style="margin:28px 0 0;font-size:13px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:20px;">
      Be together with Phoebe.
    </p>
  `);

  const text = [
    "Your letter is waiting to be written 🌿",
    "",
    `It's your turn to write in ${correspondenceName}.`,
    otherPersonName ? `${otherPersonName} is waiting to hear from you.` : "",
    "",
    `This period closes ${periodEnd}. 🌿`,
    "",
    "Write your letter:",
    writeUrl,
    "",
    "Be together with Phoebe.",
  ].filter(l => l !== undefined).join("\n");

  return sendEmail(to, subject, html, text);
}
