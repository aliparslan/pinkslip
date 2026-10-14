# Outreach readiness: sending from the user's mail app (2026-10-14)

The question: can recruiter outreach ship now as "Pinkslip drafts, you send
from your own mail" (option C), without waiting for Gmail or Outlook
send-permission approval?

The answer is not yet. The whole flow works for admins, but there are no
recruiters to email: every company's "recruiter" is the owner's test address.

## Works today (admins only, `OUTREACH = "admin"`)

- **Email recruiter** in the job page menu on the web, and the sheet on iOS.
- **Drafts:** a first email and two follow-ups, written from the resume
  profile by templates. They're free, with no AI cost.
- **Sending:** Open in Mail (a `mailto:` link on the web, `Linking.openURL`
  on iOS) or Copy email, then "I sent it".
- **Follow-up reminders:** push notifications at 3 and then about 5 business
  days, in the user's time zone.
- **Closing a thread:** "They replied" and "Stop follow-ups".
- **Cap:** a recruiter hears from at most 3 Pinkslip users a week.

## Missing before anyone else can use it

1. **Recruiter contacts.**
   - `ensureTestContact` (`worker/outreach/contacts.ts`) makes
     `OUTREACH_TEST_RECIPIENT` every company's recruiter. Nothing else
     writes `company_contacts`.
   - The roadmap's plan is the owner's lists, imported through admin, each
     contact showing its source and whether its email is verified. That
     needs the lists, an import path and a `verified` column.
2. **Remove `OUTREACH_TEST_RECIPIENT`** from `wrangler.toml` before opening
   the feature. While it's set, every user's email is addressed to the
   owner.
3. **Open the flag.** `OUTREACH = "on"` opens outreach to every signed-in
   user. There is no beta-group value.
4. **Reply detection through the forwarding address** (in the roadmap).
   Without it, a user who doesn't tap "They replied" is reminded to follow
   up with a recruiter who has already answered. The inbox already receives
   their mail, so this means matching the sender against the user's open
   threads.
5. **Web compose links.** On the web, `mailto:` does nothing for people who
   use Gmail or Outlook in the browser and have no mail app set up. Gmail
   and Outlook on the web both take compose links with the recipient,
   subject and body filled in.

## Optional

- **Detect "sent" automatically.** Open in Mail could add the user's inbox
  address as Bcc, so Pinkslip sees the sent email and "I sent it" isn't
  needed. The recruiter doesn't see a Bcc. The trade-offs:
  - The user sees an unfamiliar address in the compose window and can
    delete it.
  - Pinkslip reads the user's outgoing email. Like incoming mail, it would
    be read in memory and not stored.
