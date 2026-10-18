import type { DetectedStage } from "../../shared/email-tracking";
import type { EmailContent } from "../../worker/email/rules";

/**
 * Real-shaped job emails for measuring detection (Decisions: Email tracking
 * #1). Written to read the way each service's mail reads, not copied from
 * anyone's inbox, and not written to suit the rules: the measurement in
 * docs/email-detection-2026-10-18.md started from the rules as they were.
 *
 * `open`: whether the header check should open it. `stage`: the step it
 * reports, null for mail that reports none. `date`: the interview time or
 * deadline it states clearly, for a person in New York.
 */
export interface JobEmailFixture {
  id: string;
  service: string;
  email: EmailContent;
  open: boolean;
  stage: DetectedStage | null;
  date?: string;
}

const SENT = "Tue, 20 Oct 2026 14:00:00 +0000";

function email(from: string, address: string, subject: string, text: string, extra: Partial<EmailContent> = {}): EmailContent {
  return { from: { name: from, address }, subject, date: SENT, text, links: [], ...extra };
}

function ics(start: string, summary: string): string {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Scheduler//EN", "METHOD:REQUEST",
    "BEGIN:VEVENT", `DTSTART${start}`, `SUMMARY:${summary}`, "UID:fixture@example.com", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

export const JOB_EMAILS: JobEmailFixture[] = [
  // ─── Receipts ──────────────────────────────────────────────────────────────
  {
    id: "greenhouse-receipt", service: "Greenhouse", open: true, stage: "applied",
    email: email("Stripe", "no-reply@us.greenhouse-mail.io", "Thank you for applying to Stripe",
      "Hi Alex,\n\nThank you for your interest in Stripe! We wanted to let you know we received your application for Software Engineer, New Grad, and we are delighted that you would consider joining our team.\n\nOur team will review your application and will be in touch if your qualifications match our needs for the role.\n\nBest,\nStripe Recruiting",
      { links: ["https://boards.greenhouse.io/stripe/jobs/7012345"] }),
  },
  {
    id: "lever-receipt", service: "Lever", open: true, stage: "applied",
    email: email("Ramp", "no-reply@hire.lever.co", "Thank you for your application to Ramp",
      "Hi Alex,\n\nThanks for applying to Ramp. Your application has been received and we will review it right away.\n\nIf your application seems like a good fit for the position we will contact you soon.\n\nRegards,\nRamp"),
  },
  {
    id: "ashby-receipt", service: "Ashby", open: true, stage: "applied",
    email: email("Notion", "no-reply@ashbyhq.com", "Thanks for applying to Notion!",
      "Hi Alex,\n\nThanks for applying for the Software Engineer, Early Career role at Notion. We've received your application and our team is reviewing it. We'll reach out if there's a match.\n\nThe Notion Recruiting Team"),
  },
  {
    id: "workday-receipt", service: "Workday", open: true, stage: "applied",
    email: email("Capital One", "capitalone@myworkday.com", "Thank you for applying!",
      "Dear Alex,\n\nThank you for your interest in Capital One. We have received your application for Associate Software Engineer (R212345).\n\nYou can check the status of your application at any time by signing in to your Candidate Home.\n\nSincerely,\nCapital One Talent Acquisition"),
  },
  {
    id: "smartrecruiters-receipt", service: "SmartRecruiters", open: true, stage: "applied",
    email: email("Visa", "noreply@smartrecruiters.com", "Your application for Software Engineer",
      "Dear Alex,\n\nThank you for applying for the Software Engineer position at Visa. We have received your application and are currently reviewing your qualifications.\n\nKind regards,\nVisa Talent Acquisition"),
  },
  {
    id: "icims-receipt", service: "iCIMS", open: true, stage: "applied",
    email: email("Humana Careers", "careers@talent.icims.com", "Application Received - Software Engineer I",
      "Alex,\n\nThank you for submitting your application for the Software Engineer I position. Your application is being reviewed by our recruiting team.\n\nHumana Talent Acquisition"),
  },
  {
    id: "jobvite-receipt", service: "Jobvite", open: true, stage: "applied",
    email: email("Twilio Recruiting", "notification@jobvite.com", "Twilio - Application Confirmation",
      "Hi Alex,\n\nThis email confirms that we received your application for Software Engineer (L1). Our team will review your experience and reach out regarding next steps."),
  },
  {
    id: "taleo-receipt", service: "Taleo", open: true, stage: "applied",
    email: email("Cisco", "cisco@taleo.net", "Cisco Careers - Thank you for applying",
      "Dear Alex,\n\nThank you for applying to the Software Engineer I (Full Time) - United States position (Job ID 1423456). We appreciate your interest in Cisco."),
  },

  // ─── Rejections ────────────────────────────────────────────────────────────
  {
    id: "greenhouse-rejection", service: "Greenhouse", open: true, stage: "rejected",
    email: email("Stripe", "no-reply@us.greenhouse-mail.io", "Your application to Stripe",
      "Hi Alex,\n\nThank you for taking the time to apply for the Software Engineer, New Grad position. After careful consideration, we have decided to move forward with other candidates whose experience more closely matches our current needs.\n\nWe appreciate your interest in Stripe and wish you the best in your search."),
  },
  {
    id: "lever-rejection", service: "Lever", open: true, stage: "rejected",
    email: email("Ramp", "no-reply@hire.lever.co", "Thanks for your interest in Ramp",
      "Hi Alex,\n\nThank you for your interest in the Software Engineer role at Ramp. Unfortunately, we won't be moving forward with your application at this time.\n\nWe'll keep your information on file for future roles."),
  },
  {
    id: "ashby-rejection", service: "Ashby", open: true, stage: "rejected",
    email: email("Notion", "no-reply@ashbyhq.com", "Update on your application",
      "Hi Alex,\n\nThanks so much for your interest in Notion. After reviewing your application, we've decided not to proceed with your candidacy for the Software Engineer, Early Career role."),
  },
  {
    id: "workday-rejection", service: "Workday", open: true, stage: "rejected",
    email: email("Capital One", "capitalone@myworkday.com", "Update on your application",
      "Dear Alex,\n\nThank you for your interest in the Associate Software Engineer position. We regret to inform you that you have not been selected to move forward in the process."),
  },
  {
    id: "recruiter-rejection", service: "Recruiter", open: true, stage: "rejected",
    email: email("Jane Park", "jane@linear.app", "Re: Software Engineer application",
      "Hi Alex,\n\nThanks again for chatting with us last week. The team has decided to go in a different direction for this role, but we really enjoyed meeting you and hope our paths cross again.\n\nJane"),
  },
  {
    id: "smartrecruiters-filled", service: "SmartRecruiters", open: true, stage: "rejected",
    email: email("Visa", "noreply@smartrecruiters.com", "Your application for Software Engineer",
      "Dear Alex,\n\nThank you for your interest in Visa. The position you applied for has been filled. We encourage you to apply for other openings that match your skills."),
  },

  // ─── Interviews ────────────────────────────────────────────────────────────
  {
    id: "goodtime-availability", service: "GoodTime", open: true, stage: "interview",
    email: email("Datadog Recruiting", "scheduling@goodtime.io", "Datadog - Please share your interview availability",
      "Hi Alex,\n\nWe're excited to move you forward to the Technical Phone Screen for Software Engineer - New Grad! Please use the link below to share your availability over the next week.",
      { links: ["https://app.goodtime.io/availability/abc123"] }),
  },
  {
    id: "calendly-booked", service: "Calendly", open: true, stage: "interview", date: "2026-10-21T21:00:00.000Z",
    email: email("Calendly", "notifications@calendly.com", "New Event: Alex Kim - 30 Minute Recruiter Call",
      "Hi Alex,\n\nA new event has been scheduled.\n\nEvent Type: 30 Minute Recruiter Call\nInvitee: Alex Kim\nEvent Date/Time: 2:00pm - 2:30pm (Pacific Time), Wednesday, October 21, 2026\nLocation: Google Meet",
      { links: ["https://calendly.com/rippling-recruiting/30min"] }),
  },
  {
    id: "greenhouse-scheduled", service: "Greenhouse", open: true, stage: "interview", date: "2026-10-21T15:00:00.000Z",
    email: email("Stripe", "no-reply@us.greenhouse-mail.io", "Interview Confirmation: Software Engineer, New Grad",
      "Hi Alex,\n\nYour interview has been scheduled. Here are the details:\n\nWednesday, October 21, 2026\n11:00 AM - 12:00 PM Eastern Time (US & Canada)\nLocation: Zoom (link below)",
      { calendar: [ics(";TZID=America/New_York:20261021T110000", "Stripe Interview")] }),
  },
  {
    id: "modernloop-confirmed", service: "ModernLoop", open: true, stage: "interview", date: "2026-10-23T20:00:00.000Z",
    email: email("Figma Recruiting", "no-reply@modernloop.io", "Interview Confirmed: Software Engineer, Early Career",
      "Hi Alex,\n\nYour interview with Figma is confirmed for Friday, October 23 at 1:00 PM PT. You'll meet with two engineers from the Editor team.\n\nGood luck!"),
  },
  {
    id: "recruiter-call", service: "Recruiter", open: true, stage: "interview",
    email: email("Sam Lee", "sam.lee@databricks.com", "Next steps - Databricks",
      "Hi Alex,\n\nThanks for applying! I'd love to set up a 30-minute call to learn more about you and walk through the role. Are you free this week? Send me a few times that work."),
  },
  {
    id: "karat-interview", service: "Karat", open: true, stage: "interview",
    email: email("Karat", "invite@karat.io", "Schedule your technical interview with Robinhood",
      "Hi Alex,\n\nRobinhood has invited you to complete a technical interview with Karat. Schedule your interview at a time that works for you.",
      { links: ["https://karat.io/schedule/xyz"] }),
  },
  {
    id: "calendar-invite", service: "Google Calendar", open: true, stage: "interview", date: "2026-10-22T14:00:00.000Z",
    email: email("Datadog Recruiting", "recruiting@datadoghq.com", "Invitation: Datadog Technical Interview @ Thu Oct 22, 2026 10am - 11am (EDT)",
      "You have been invited to the following event.\n\nDatadog Technical Interview\nWhen: Thursday Oct 22, 2026 10am – 11am Eastern Time - New York\nJoining info: meet.google.com/abc-defg-hij",
      { calendar: [ics(";TZID=America/New_York:20261022T100000", "Datadog Technical Interview")] }),
  },

  // Added after the first measurement, to check the fixes aren't fitted to the set.
  {
    id: "greenhouse-scheduled-text", service: "Greenhouse", open: true, stage: "interview", date: "2026-10-21T15:00:00.000Z",
    email: email("Stripe", "no-reply@us.greenhouse-mail.io", "Interview Confirmation: Software Engineer, New Grad",
      "Hi Alex,\n\nYour interview has been scheduled. Here are the details:\n\nWednesday, October 21, 2026\n11:00 AM - 12:00 PM Eastern Time (US & Canada)\nLocation: Zoom (link below)"),
  },
  {
    id: "pick-a-time", service: "GoodTime", open: true, stage: "interview",
    email: email("Datadog Recruiting", "scheduling@goodtime.io", "Datadog - Select your interview time",
      "Hi Alex,\n\nPlease select a time for your technical interview: Thursday, October 22 at 10:00 AM ET or Friday, October 23 at 2:00 PM ET."),
  },
  {
    id: "reply-with-history", service: "Recruiter", open: true, stage: "interview",
    email: email("Sam Lee", "sam.lee@databricks.com", "Re: Next steps - Databricks",
      "Hi Alex,\n\nGreat news: the team would like to invite you to an onsite interview. I'll send the details soon.\n\nOn Mon, Oct 13, 2026 at 9:15 AM Alex Kim <alex@gmail.com> wrote:\n> Thanks for the call on Friday, October 10 at 3:00 PM ET!"),
  },

  // ─── Assessments ───────────────────────────────────────────────────────────
  {
    id: "hackerrank-invite", service: "HackerRank", open: true, stage: "assessment", date: "2026-10-25T06:59:00.000Z",
    email: email("HackerRank", "support@hackerrankforwork.com", "Invitation: Coinbase Software Engineer Assessment",
      "Hi Alex,\n\nCoinbase has invited you to take an assessment on HackerRank.\n\nTest: SWE New Grad 2027\nDuration: 70 minutes\n\nPlease complete the test by Oct 24, 2026 11:59 PM PDT.",
      { links: ["https://www.hackerrank.com/test/abc123"] }),
  },
  {
    id: "codesignal-invite", service: "CodeSignal", open: true, stage: "assessment", date: "2026-10-27",
    email: email("CodeSignal", "noreply@codesignal.com", "Complete your General Coding Assessment for Uber",
      "Hi Alex,\n\nUber has invited you to complete the General Coding Assessment. You have 7 days to complete it.",
      { links: ["https://app.codesignal.com/invite/xyz"] }),
  },
  {
    id: "hirevue-invite", service: "HireVue", open: true, stage: "assessment", date: "2026-10-25",
    email: email("Goldman Sachs", "noreply@hirevue.com", "Goldman Sachs - Next Steps: HireVue Interview",
      "Dear Alex,\n\nThank you for your interest in Goldman Sachs. As the next step, please complete a HireVue video interview within 5 days of receiving this email.",
      { links: ["https://app.hirevue.com/interviews/abc"] }),
  },
  {
    id: "take-home", service: "Greenhouse", open: true, stage: "assessment", date: "2026-10-23",
    email: email("Plaid", "no-reply@us.greenhouse-mail.io", "Plaid Take-Home Assignment",
      "Hi Alex,\n\nThanks for your time on the phone. The next step is a take-home assignment, linked below. Please submit it by Friday, October 23."),
  },

  // ─── Offers ────────────────────────────────────────────────────────────────
  {
    id: "offer-email", service: "Recruiter", open: true, stage: "offer",
    email: email("Stripe Recruiting", "recruiting@stripe.com", "Your offer from Stripe",
      "Hi Alex,\n\nWe are thrilled to extend you an offer to join Stripe as a Software Engineer! Please find your offer letter attached, and let me know when you'd like to talk it through."),
  },
  {
    id: "docusign-offer", service: "DocuSign", open: true, stage: "offer",
    email: email("Ramp via DocuSign", "dse@docusign.net", "Please DocuSign: Ramp Offer Letter - Alex Kim",
      "Ramp sent you a document to review and sign.\n\nPlease review and sign your offer letter."),
  },

  // ─── Not a step ────────────────────────────────────────────────────────────
  {
    id: "linkedin-alert", service: "LinkedIn", open: false, stage: null,
    email: email("LinkedIn Job Alerts", "jobalerts-noreply@linkedin.com", "Software Engineer: Stripe - New Grad and more",
      "Your job alert for software engineer in New York.\nStripe · New York, NY · Apply now"),
  },
  {
    id: "indeed-alert", service: "Indeed", open: false, stage: null,
    email: email("Indeed", "alert@indeed.com", "New jobs for \"software engineer\" in New York, NY",
      "20 new jobs match your search. Software Engineer at Acme. Easily apply."),
  },
  {
    id: "ats-newsletter", service: "Greenhouse", open: true, stage: null,
    email: email("Greenhouse", "newsletter@greenhouse.io", "Hiring trends for 2027",
      "The latest research on how companies hire, in five charts."),
  },
  {
    id: "company-hiring", service: "Company", open: true, stage: null,
    email: email("Notion", "team@makenotion.com", "We're hiring for 20+ roles",
      "Notion is growing. Check out our open roles across engineering, design and sales."),
  },
  {
    id: "workday-status", service: "Workday", open: true, stage: null,
    email: email("Capital One", "capitalone@myworkday.com", "Your application status has been updated",
      "Dear Alex,\n\nThere has been an update to your application. Please sign in to your Candidate Home to view it."),
  },
  {
    id: "workday-unfinished", service: "Workday", open: true, stage: null,
    email: email("Capital One", "capitalone@myworkday.com", "Finish your application",
      "Dear Alex,\n\nYou recently started an application for Associate Software Engineer at Capital One. Your application is not yet complete. Sign in to finish it."),
  },
  {
    id: "cold-recruiter", service: "Recruiter", open: true, stage: null,
    email: email("Chris from Acme", "chris@acme.example", "Opportunity at Acme",
      "Hi Alex,\n\nI came across your profile and think you'd be a great fit for a role on our platform team. Would you be open to a quick chat sometime?"),
  },
  {
    id: "receipt-conditional", service: "Greenhouse", open: true, stage: "applied",
    email: email("Zephyr Labs", "no-reply@us.greenhouse-mail.io", "Thank you for applying to Zephyr Labs",
      "Hi Alex, thanks for applying for the Software Engineer, New Grad position. If your experience matches, we'll reach out to schedule an interview."),
  },
  {
    id: "info-session", service: "Company", open: false, stage: null,
    email: email("Jane Street Events", "events@janestreet.com", "Join our virtual info session",
      "We'd like to offer you a spot in our upcoming info session for students and recent graduates on October 28."),
  },
];
