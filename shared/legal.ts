/** Privacy, terms and support page content, shared by the Hono Worker and the
 * React web app. The App Store links to `/privacy` and `/support`, and the
 * app's sign-in sheet to `/terms` and `/privacy`, so the paths are stable.
 * Bodies are static, repository-owned HTML. */
export const LEGAL_UPDATED_AT = "October 22, 2026";
export const TERMS_UPDATED_AT = "October 23, 2026";
export const SUPPORT_EMAIL = "support@pinkslip.work";

export interface LegalPage {
  path: "/privacy" | "/terms" | "/support" | "/support/thanks";
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
<p>Pinkslip uses Cloudflare to host the service, store account and resume data, deliver sign-in email, and process resume extraction or tailoring requests with Workers AI. If you use Sign in with Apple or enable iOS notifications, Apple processes the information needed to provide those features. If you leave a tip, Stripe processes the payment on its own page; Pinkslip doesn't receive your card details. These providers may process information only to provide their services to Pinkslip and under their own legal obligations.</p>

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
  <a href="/terms">Terms of use</a>
  <a href="/support">Pinkslip support</a>
</nav>
`,
};

export const termsPage: LegalPage = {
  path: "/terms",
  title: "Terms of use",
  description: "The terms for using the Pinkslip app and website.",
  subtitle: `Last updated ${TERMS_UPDATED_AT}`,
  bodyHtml: `
<p>These terms cover your use of the Pinkslip app and website. By using Pinkslip, you agree to them. If you don't agree, don't use Pinkslip.</p>

<h2>What Pinkslip is</h2>
<p>Pinkslip helps you find jobs, keep track of your applications, and get applications ready to send. Listings come from employers' own career pages and job boards. Pinkslip isn't an employer, a recruiter, or a staffing agency, and it isn't connected to the companies it lists unless it says so.</p>

<h2>Who can use it</h2>
<p>You need to be at least 16 years old and able to agree to these terms.</p>

<h2>Your account</h2>
<p>Keep your sign-in secure and the information in your account accurate. You're responsible for what happens in your account. You can delete it at any time under <strong>You → Account → Delete account</strong>.</p>

<h2>Jobs and applications</h2>
<ul>
  <li>Listings, pay ranges, visa sponsorship, and other details come from the postings themselves and can be wrong, out of date, or closed. Check the employer's page before you rely on them.</li>
  <li>Pinkslip can't promise that you'll hear back, get an interview, or get a job.</li>
  <li>When Pinkslip fills in an application for you, you review it and you choose whether to send it. You're responsible for what your applications say, including that it's true.</li>
  <li>Employers' sites and application systems have their own terms. Pinkslip doesn't control them or how employers use what you send.</li>
</ul>

<h2>Email and outreach</h2>
<p>If you forward email to Pinkslip, only forward mail you're allowed to share. If you use Pinkslip to write to recruiters, you're responsible for what you send. Don't use it for spam or bulk messages nobody asked for. Pinkslip limits how many messages go out and may stop outreach from an account that misuses it.</p>

<h2>Your content</h2>
<p>Your resume, answers, and anything else you add stay yours. You let Pinkslip store, process, and use them only to run the features you use, such as matching jobs, filling in applications, and tailoring a resume. Only add content you have the right to use, and don't add other people's personal information without their permission.</p>

<h2>Using Pinkslip fairly</h2>
<p>Don't misuse Pinkslip. That includes trying to break or overload it, getting around its limits, collecting data from it in bulk with automated tools, using it to break the law, pretending to be someone else, and sending false reports. Pinkslip may suspend or close accounts that do.</p>

<h2>Tips and paid plans</h2>
<p>Tips are optional and go through Stripe. They don't unlock anything and aren't refundable, except where the law requires. If Pinkslip offers a paid plan, its price and terms are shown before you buy, and purchases in the iOS app are handled by Apple under its terms.</p>

<h2>Pinkslip's own work</h2>
<p>The Pinkslip app, website, design, and name belong to Pinkslip. These terms let you use them as offered and don't give you any other rights to them. Company names and logos belong to their owners.</p>

<h2>Other services</h2>
<p>Pinkslip works with services run by others, such as Sign in with Apple, Google sign-in, employers' application sites, and Stripe. Their terms and privacy policies apply when you use them.</p>

<h2>Changes and availability</h2>
<p>Pinkslip is still being built, so features change, and some are offered for a while and then changed or removed. Pinkslip tries to keep the service running but can't promise it will always be available or free of errors.</p>

<h2>No guarantees</h2>
<p>Pinkslip is provided as is and as available. To the extent the law allows, Pinkslip makes no promises about the service beyond what these terms say, including that it fits a particular purpose.</p>

<h2>Limits on liability</h2>
<p>To the extent the law allows, Pinkslip isn't liable for indirect or consequential losses, such as a missed job or lost earnings, and its total liability to you for anything related to Pinkslip is limited to the greater of what you paid Pinkslip in the 12 months before the claim or US$50. Some places don't allow these limits, so they may not apply to you.</p>

<h2>The App Store</h2>
<p>If you got Pinkslip from the App Store, Apple's standard license for apps also applies. These terms are between you and Pinkslip, not Apple, and Apple isn't responsible for Pinkslip or for supporting it.</p>

<h2>Ending</h2>
<p>You can stop using Pinkslip and delete your account at any time. Pinkslip may suspend or end your access if you break these terms or if it stops offering the service.</p>

<h2>Changes to these terms</h2>
<p>If these terms change materially, Pinkslip will update the date above and let you know in the app or by email when appropriate. Using Pinkslip after a change means you accept the new terms.</p>

<h2>Contact</h2>
<p>Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> with questions about these terms.</p>
<nav class="actions" aria-label="Legal and support links">
  <a href="/privacy">Privacy policy</a>
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
  <a href="/terms">Terms of use</a>
</nav>
`,
};

/** Where Stripe sends people after a tip, when the iPhone doesn't open the
 * app there itself (shared/support.ts). */
export const supportThanksPage: LegalPage = {
  path: "/support/thanks",
  title: "Thank you for your support!",
  description: "Your tip to Pinkslip went through.",
  subtitle: "Your tip went through.",
  bodyHtml: `
<p>Stripe emails you the receipt.</p>
<nav class="actions" aria-label="Back to Pinkslip">
  <a href="pinkslip://support/thanks">Back to Pinkslip</a>
</nav>
`,
};
