import type { ApplySend, SendNeed } from "@pinkslip/core/api";
import type { SendJob } from "../redesign/sends/SendSheets";

/** The sample send's job (the kit's Stripe, as on Paper's send screens). */
export const SEND_SAMPLE_JOB: SendJob = { company: "Stripe", domain: "stripe.com", title: "Software Engineer, New Grad" };

const SCHOOLS = [
  "Arizona State University", "Boston University", "Carnegie Mellon University", "Columbia University", "Cornell University", "Georgia Tech",
  "Harvard University", "Northeastern University", "New York University", "Purdue University", "Stanford University", "UC Berkeley",
  "UCLA", "University of Michigan", "University of Texas at Austin", "University of Washington", "UIUC", "Yale University",
];

/** Three questions a send stopped on: a sentence to write, a visa question
 * Pinkslip never guesses, and a school from a long list. */
export const NEEDS_SAMPLE: SendNeed[] = [
  { ref: "why", label: "Why do you want to work at Stripe?", kind: "textarea", options: [], required: true },
  { ref: "visa", label: "Will you need Stripe to sponsor a visa, now or later?", kind: "radio", options: ["Yes", "No"], required: true },
  { ref: "school", label: "School", kind: "combobox", options: SCHOOLS, required: true },
];

const base: ApplySend = {
  id: "sample-send",
  job_id: "sample-job",
  company: "Stripe",
  title: "Software Engineer, New Grad",
  ats: "greenhouse",
  url: "https://job-boards.greenhouse.io/stripe/jobs/1",
  dry_run: false,
  status: "submitted",
  detail: null,
  needs: [],
  sent: [
    { label: "Resume/CV", value: "Jordan_Lee.pdf", by: "pinkslip" },
    { label: "Why do you want to work at Stripe?", value: "I've wanted to build payments infrastructure since my first side project took its first dollar.", by: "pinkslip" },
    { label: "Are you authorized to work in the US?", value: "Yes", by: "pinkslip" },
    { label: "Have you worked at Stripe before?", value: "No", by: "jev" },
    { label: "LinkedIn profile", value: "linkedin.com/in/jordanlee", by: "site" },
    { label: "First Name", value: "Jordan", by: "pinkslip" },
    { label: "Last Name", value: "Lee", by: "pinkslip" },
    { label: "Email", value: "jordan@lee.dev", by: "pinkslip" },
  ],
  form_shot: false,
  proof_shot: false,
  confirmation_text: "Thank you for applying to Stripe!",
  confirmation_url: null,
  progress: { filled: 14, of: 14 },
  created_at: "2026-10-24T14:51:30Z",
  finished_at: "2026-10-24T14:52:10Z",
};

/** A send that went through, with the thank-you page. */
export const SENT_SAMPLE: ApplySend = base;

/** Check first's: everything filled, nothing sent. */
export const READY_SAMPLE: ApplySend = { ...base, id: "sample-ready", dry_run: true, status: "ready", confirmation_text: null };
