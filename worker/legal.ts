const LEGAL_UPDATED_AT = "August 27, 2026";
const SUPPORT_EMAIL = "login@pinkslip.work";

export const LEGAL_STYLES = `
:root {
  color-scheme: light dark;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: Canvas;
  color: CanvasText;
}
* { box-sizing: border-box; }
body { margin: 0; }
main {
  width: min(44rem, 100%);
  margin-inline: auto;
  padding: 3rem 1.25rem 5rem;
  line-height: 1.6;
}
header { margin-bottom: 2.5rem; }
h1, h2 { line-height: 1.18; letter-spacing: -0.02em; }
h1 { margin: 0 0 0.5rem; font-size: clamp(2rem, 8vw, 3.25rem); }
h2 { margin: 2.25rem 0 0.5rem; font-size: 1.25rem; }
p, ul { margin: 0.5rem 0 1rem; }
ul { padding-left: 1.25rem; }
li + li { margin-top: 0.45rem; }
a { color: LinkText; text-underline-offset: 0.16em; }
.eyebrow { margin: 0 0 0.4rem; font-weight: 650; }
.updated { color: GrayText; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; margin-top: 1.5rem; }
@media (max-width: 32rem) {
  main { padding-top: 2rem; }
}
`;

function page(title: string, description: string, content: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <title>${title} · Pinkslip</title>
  <link rel="stylesheet" href="/legal.css">
</head>
<body>
  <main>
    ${content}
  </main>
</body>
</html>`;
}

export function privacyPolicyPage(): string {
  return page(
    "Privacy policy",
    "How Pinkslip collects, uses, retains, and protects information.",
    `<header>
      <p class="eyebrow">Pinkslip</p>
      <h1>Privacy policy</h1>
      <p class="updated">Last updated ${LEGAL_UPDATED_AT}</p>
    </header>

    <p>This policy explains how Pinkslip handles information when you use the Pinkslip app and service.</p>

    <h2>Information Pinkslip collects</h2>
    <ul>
      <li><strong>Account information:</strong> your display name, email address, sign-in provider, and the identifiers needed to keep you signed in.</li>
      <li><strong>Career information:</strong> job preferences, location choices, resume and profile content, tailoring instructions and results, saved or dismissed jobs, viewed jobs, applications, and application status.</li>
      <li><strong>Notification information:</strong> notification preferences and a device push token when you enable notifications.</li>
      <li><strong>Support content:</strong> feedback, content reports, and information you include when asking for help.</li>
      <li><strong>Technical and usage information:</strong> app version, session and security information, request IP address for abuse prevention, product interactions, and error or delivery details used to operate and improve the service.</li>
    </ul>

    <h2>How Pinkslip uses information</h2>
    <p>Pinkslip uses this information to find and rank relevant jobs, sync your choices, send alerts you enable, create resume and tailoring tools you request, authenticate accounts, prevent abuse, provide support, and improve reliability. Pinkslip does not sell personal information or use it for third-party advertising.</p>

    <h2>Service providers</h2>
    <p>Pinkslip uses Cloudflare to host the service, store account and resume data, deliver sign-in email, and process resume extraction or tailoring requests with Workers AI. If you use Sign in with Apple or enable iOS notifications, Apple processes the information needed to provide those features. These providers may process information only to provide their services to Pinkslip and under their own legal obligations.</p>

    <h2>Retention and deletion</h2>
    <p>Pinkslip keeps account-linked information while your account is active and as needed to provide the features you use. Short-lived sign-in and security records expire or are removed as they are no longer needed. De-identified operational records may be retained to measure reliability and prevent abuse.</p>
    <p>You can delete a signed-in account in the app under <strong>You → Account → Delete account</strong>. This removes account-linked server data and stored resume artifacts. Information already cached on your device can be removed by deleting the app. Backup copies may remain until routine recovery backups expire.</p>

    <h2>Your choices</h2>
    <p>You can change job and notification preferences in the app, disable notifications in Pinkslip or iOS Settings, use Pinkslip as a guest, and delete a signed-in account from the app. You can also contact Pinkslip to ask a privacy question.</p>

    <h2>Security</h2>
    <p>Pinkslip uses access controls, encrypted network connections, and platform security features to protect information. No storage or transmission method can guarantee absolute security.</p>

    <h2>Changes to this policy</h2>
    <p>If this policy changes materially, Pinkslip will update the date above and provide notice when appropriate.</p>

    <h2>Contact</h2>
    <p>Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> with privacy questions or requests.</p>
    <nav class="actions" aria-label="Legal and support links">
      <a href="/support">Pinkslip support</a>
    </nav>`,
  );
}

export function supportPage(): string {
  return page(
    "Support",
    "Contact Pinkslip support and find account or privacy help.",
    `<header>
      <p class="eyebrow">Pinkslip</p>
      <h1>Support</h1>
      <p class="updated">Help with the Pinkslip iOS app</p>
    </header>

    <h2>Contact Pinkslip</h2>
    <p>Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> for app issues, account help, general feedback, or feature requests. Include the Pinkslip app version and iOS version when they are relevant to the problem.</p>
    <p>You can also send feedback from <strong>You → Help and feedback</strong> in the app.</p>

    <h2>Account deletion</h2>
    <p>Open <strong>You → Account</strong>, select <strong>Delete account</strong>, and confirm. Pinkslip deletes the signed-in account and its account-linked server data without requiring you to contact support.</p>

    <h2>Privacy</h2>
    <p>Read the <a href="/privacy">Pinkslip privacy policy</a> for information about data collection, use, retention, and your choices.</p>

    <nav class="actions" aria-label="Legal and support links">
      <a href="mailto:${SUPPORT_EMAIL}">Email Pinkslip support</a>
      <a href="/privacy">Read the privacy policy</a>
    </nav>`,
  );
}
