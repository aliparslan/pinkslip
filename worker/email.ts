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

  const fromName = env.EMAIL_FROM_NAME?.trim() || "pinkslip";
  const escapedUrl = escapeHtml(args.verifyUrl);

  const text = [
    "Hi,",
    "",
    "Use the link below to sign in to pinkslip. It works on the device where you",
    "requested it and expires in 15 minutes.",
    "",
    args.verifyUrl,
    "",
    "If you didn't request this, you can safely ignore this email — no one can sign",
    "in without opening the link above.",
    "",
    "— pinkslip",
    "Get alerted the moment new roles drop. https://pinkslip.alip.dev",
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
                <div style="font-size:20px;font-weight:700;color:#111;"><span style="color:#e3006d;">pink</span>slip</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 4px;color:#333;font-size:15px;line-height:1.5;">
                <p style="margin:0 0 16px;">Tap the button below to sign in to your pinkslip account. This link only works on the device where you requested it, and it expires in <strong>15 minutes</strong>.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 20px;">
                <a href="${escapedUrl}" style="display:inline-block;background:#e3006d;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">Sign in to pinkslip</a>
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
                pinkslip — get alerted the moment new roles drop.
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
    subject: "Your pinkslip sign-in link",
    text,
    html,
  });
}
