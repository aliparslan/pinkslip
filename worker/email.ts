import type { Env } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendMagicLinkEmail(
  env: Env,
  args: {
    to: string;
    verifyUrl: string;
  }
) {
  if (!env.EMAIL) {
    throw new Error("Email sending is not configured");
  }

  const fromEmail = env.EMAIL_FROM_ADDRESS?.trim();
  if (!fromEmail) {
    throw new Error("EMAIL_FROM_ADDRESS is not configured");
  }

  const fromName = env.EMAIL_FROM_NAME?.trim() || "Pinkslip";
  const escapedUrl = escapeHtml(args.verifyUrl);

  const text = [
    "Hi,",
    "",
    "Use the link below to sign in to Pinkslip. It works on the device where you",
    "requested it and expires in 15 minutes.",
    "",
    args.verifyUrl,
    "",
    "If you didn't request this, you can safely ignore this email — no one can sign",
    "in without opening the link above.",
    "",
    "— Pinkslip",
    "Get alerted the moment new roles drop. https://pinkslip.work",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f5f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:14px;border:1px solid #ececec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <div style="font-size:20px;font-weight:700;color:#111;"><span style="color:#e3006d;">Pink</span>slip</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 4px;color:#333;font-size:15px;line-height:1.5;">
                <p style="margin:0 0 16px;">Tap the button below to sign in to your Pinkslip account. This link only works on the device where you requested it, and it expires in <strong>15 minutes</strong>.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 20px;">
                <a href="${escapedUrl}" style="display:inline-block;background:#e3006d;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">Sign in to Pinkslip</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 8px;color:#777;font-size:12px;line-height:1.5;">
                <p style="margin:0 0 6px;">Or paste this URL into your browser:</p>
                <p style="margin:0 0 16px;word-break:break-all;"><a href="${escapedUrl}" style="color:#e3006d;">${escapedUrl}</a></p>
                <p style="margin:0;">If you didn't request this, you can safely ignore this email — no one can sign in without opening the link.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px;border-top:1px solid #f0f0f0;color:#999;font-size:12px;">
                Pinkslip — get alerted the moment new roles drop.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  await env.EMAIL.send({
    to: args.to,
    from: { email: fromEmail, name: fromName },
    replyTo: { email: fromEmail, name: fromName },
    subject: "Your Pinkslip sign-in link",
    text,
    html,
  });
}

/** "Email me these steps": setting up forwarding happens on a computer, so
 * the steps go to the account's own inbox. */
export async function sendForwardingStepsEmail(
  env: Env,
  args: { to: string; address: string; providerName: string; steps: string[] }
) {
  if (!env.EMAIL) throw new Error("Email sending is not configured");
  const fromEmail = env.EMAIL_FROM_ADDRESS?.trim();
  if (!fromEmail) throw new Error("EMAIL_FROM_ADDRESS is not configured");
  const fromName = env.EMAIL_FROM_NAME?.trim() || "Pinkslip";

  const text = [
    `Forward your job email from ${args.providerName} to Pinkslip, and Tracker moves your applications along when companies write.`,
    "",
    ...args.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    `Your address: ${args.address}`,
    "",
    "Only job mail gets opened, and no email is kept.",
    "",
    "— Pinkslip",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px 0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;border:1px solid #ececec;">
        <tr><td style="padding:28px 28px 4px;font-size:20px;font-weight:600;color:#111;">Set up email tracking</td></tr>
        <tr><td style="padding:8px 28px 4px;color:#444;font-size:15px;line-height:1.5;">Forward your job email from ${escapeHtml(args.providerName)} to Pinkslip, and Tracker moves your applications along when companies write.</td></tr>
        <tr><td style="padding:8px 28px;"><ol style="margin:0;padding-left:20px;color:#222;font-size:15px;line-height:1.55;">${args.steps.map((step) => `<li style="margin:0 0 8px;">${escapeHtml(step)}</li>`).join("")}</ol></td></tr>
        <tr><td style="padding:4px 28px 8px;"><div style="background:#f4f4f2;border-radius:10px;padding:12px 14px;font-size:15px;font-weight:600;color:#111;word-break:break-all;">${escapeHtml(args.address)}</div></td></tr>
        <tr><td style="padding:8px 28px 28px;color:#777;font-size:13px;line-height:1.5;">Only job mail gets opened, and no email is kept.</td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;

  await env.EMAIL.send({
    to: args.to,
    from: { email: fromEmail, name: fromName },
    replyTo: { email: fromEmail, name: fromName },
    subject: "Set up email tracking",
    text,
    html,
  });
}

/** N18, forwarding stopped (Decisions: Email tracking #5): by email, since
 * the fix happens in the person's mail settings. */
export async function sendForwardingStoppedEmail(
  env: Env,
  args: { to: string; address: string; lastEmailDay: string }
) {
  if (!env.EMAIL) throw new Error("Email sending is not configured");
  const fromEmail = env.EMAIL_FROM_ADDRESS?.trim();
  if (!fromEmail) throw new Error("EMAIL_FROM_ADDRESS is not configured");
  const fromName = env.EMAIL_FROM_NAME?.trim() || "Pinkslip";
  const lead = `Nothing has reached your Pinkslip address since ${args.lastEmailDay}, so Tracker isn't hearing from companies. Forwarding may have been turned off or paused in your mail settings.`;
  const check = "Open your mail's forwarding settings and check that mail still forwards to this address:";

  const text = [lead, "", check, "", args.address, "", "If you stopped on purpose, you can ignore this; it won't be sent again until mail arrives and stops once more.", "", "— Pinkslip"].join("\n");
  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px 0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;border:1px solid #ececec;">
        <tr><td style="padding:28px 28px 4px;font-size:20px;font-weight:600;color:#111;">Your job emails stopped</td></tr>
        <tr><td style="padding:8px 28px 4px;color:#444;font-size:15px;line-height:1.5;">${escapeHtml(lead)}</td></tr>
        <tr><td style="padding:8px 28px 4px;color:#444;font-size:15px;line-height:1.5;">${escapeHtml(check)}</td></tr>
        <tr><td style="padding:4px 28px 8px;"><div style="background:#f4f4f2;border-radius:10px;padding:12px 14px;font-size:15px;font-weight:600;color:#111;word-break:break-all;">${escapeHtml(args.address)}</div></td></tr>
        <tr><td style="padding:8px 28px 28px;color:#777;font-size:13px;line-height:1.5;">If you stopped on purpose, you can ignore this; it won't be sent again until mail arrives and stops once more.</td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;

  await env.EMAIL.send({
    to: args.to,
    from: { email: fromEmail, name: fromName },
    replyTo: { email: fromEmail, name: fromName },
    subject: "Your job emails stopped reaching Pinkslip",
    text,
    html,
  });
}
