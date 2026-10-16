import type { Application } from "@pinkslip/core/api";
import type { OutreachThread } from "@pinkslip/domain/outreach";
import { router } from "expo-router";
import { useState } from "react";
import { toast } from "../../ui";
import { PersonView } from "../redesign/outreach/PersonPage";

const DAY = 24 * 60 * 60 * 1000;

/** Two people at Stripe and Mercury, as Paper's Outreach board draws them:
 * Dana not written to yet, Marcus written to with a follow-up due. */
export function outreachSample(now = Date.now()): OutreachThread[] {
  const at = (ms: number) => new Date(now + ms).toISOString();
  const nine = (days: number) => { const date = new Date(now + days * DAY); date.setHours(9, 0, 0, 0); return date.toISOString(); };
  return [
    {
      id: "sample-dana", status: "draft", job_id: "sample-stripe", job_title: "Software Engineer, New Grad", company_id: "stripe", company_name: "Stripe",
      contact: { name: "Dana Whitfield", email: "dana.whitfield@stripe.com", title: "University Recruiter", test: false },
      messages: [
        { id: "dana-0", step: 0, subject: "Software Engineer, New Grad", body: "Hi Dana, I applied to the Software Engineer, New Grad role...", status: "draft", due_at: null, sent_at: null },
      ],
      created_at: at(-DAY), updated_at: at(-DAY),
    },
    {
      id: "sample-marcus", status: "active", job_id: "sample-mercury", job_title: "Software Engineer, New Grad", company_id: "mercury", company_name: "Mercury",
      contact: { name: "Marcus Ito", email: "marcus.ito@mercury.com", title: "Technical Recruiter, Payments", test: false },
      messages: [
        { id: "marcus-0", step: 0, subject: "Software Engineer, New Grad", body: "", status: "sent", due_at: null, sent_at: at(-4 * DAY) },
        { id: "marcus-1", step: 1, subject: "", body: "", status: "scheduled", due_at: at(-2 * 60 * 60 * 1000), sent_at: null },
        { id: "marcus-2", step: 2, subject: "", body: "", status: "scheduled", due_at: nine(7), sent_at: null },
      ],
      created_at: at(-5 * DAY), updated_at: at(-4 * DAY),
    },
  ];
}

/** A person's page on the sample: Write skips the mail app and asks at once;
 * nothing is sent or saved. */
export function SamplePersonPage({ threadId }: { threadId: string }) {
  const [threads, setThreads] = useState(() => outreachSample());
  const thread = threads.find((item) => item.id === threadId) ?? threads[0]!;
  const applications: Application[] = [];
  const change = (patch: (thread: OutreachThread) => OutreachThread) => setThreads((current) => current.map((item) => item.id === thread.id ? patch(item) : item));
  return <PersonView thread={thread} applications={applications} actions={{
    write: async () => { toast.show({ message: "Sample: the mail app would open here." }); },
    markSent: async (messageId) => change((item) => ({
      ...item, status: "active",
      messages: [
        ...item.messages.map((message) => message.id === messageId ? { ...message, status: "sent" as const, sent_at: new Date().toISOString() } : message),
        { id: `${item.id}-1`, step: 1, subject: "", body: "", status: "scheduled", due_at: new Date(Date.now() + 3 * DAY).toISOString(), sent_at: null },
        { id: `${item.id}-2`, step: 2, subject: "", body: "", status: "scheduled", due_at: new Date(Date.now() + 8 * DAY).toISOString(), sent_at: null },
      ],
    })),
    markReplied: async () => change((item) => ({ ...item, status: "replied", messages: item.messages.map((message) => message.status === "scheduled" ? { ...message, status: "skipped" as const } : message) })),
    stop: async () => change((item) => ({ ...item, status: "stopped", messages: item.messages.map((message) => message.status === "scheduled" ? { ...message, status: "skipped" as const } : message) })),
    openApplication: () => router.back(),
  }} />;
}
