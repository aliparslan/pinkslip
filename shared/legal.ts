/** Privacy and support page content, shared by the Hono Worker (which serves
 * the current site) and the React web app. The App Store links to `/privacy`
 * and `/support`, so the paths are stable. Bodies are static, repository-owned
 * HTML. */
export const LEGAL_UPDATED_AT = "August 27, 2026";
export const SUPPORT_EMAIL = "login@pinkslip.work";

export interface LegalPage {
  path: "/privacy" | "/support";
  title: string;
  description: string;
  subtitle: string;
  bodyHtml: string;
}

export const privacyPolicy: LegalPage = {
  path: "/privacy",
  title: "Privacy policy",
  description: "How Pinkslip collects, uses, retains, and protects information.",
  subtitle: `Last updated ${LEGAL_UPDATED_AT}`,
  bodyHtml: `
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
</nav>
`,
};

export const supportPage: LegalPage = {
  path: "/support",
  title: "Support",
  description: "Contact Pinkslip support and find account or privacy help.",
  subtitle: "Help with the Pinkslip iOS app",
  bodyHtml: `
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
</nav>
`,
};
