import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildNotificationPayload,
  sendPushNotification,
} from "@worker/push";
import type { NotificationJob, PushSubscription, VapidConfig } from "@worker/push";

// ─── buildNotificationPayload tests ─────────────────────────────────────────

describe("buildNotificationPayload", () => {
  // Test 1: Single job
  it("single job: company as title, job title as body, /jobs/{id} as url", () => {
    const jobs: NotificationJob[] = [
      { company: "Anthropic", title: "Software Engineer", jobId: "abc123" },
    ];
    const result = buildNotificationPayload(jobs);
    expect(result.title).toBe("Anthropic");
    expect(result.body).toBe("Software Engineer");
    expect(result.data.url).toBe("/jobs/abc123");
  });

  // Test 2: 5+ jobs
  it("5+ jobs: 'N new jobs' title, company list (up to 4) + 'and more', '/' url", () => {
    const jobs: NotificationJob[] = [
      { company: "Anthropic", title: "SWE", jobId: "1" },
      { company: "OpenAI", title: "SWE", jobId: "2" },
      { company: "Mistral", title: "SWE", jobId: "3" },
      { company: "Cohere", title: "SWE", jobId: "4" },
      { company: "DeepMind", title: "SWE", jobId: "5" },
    ];
    const result = buildNotificationPayload(jobs);
    expect(result.title).toBe("5 new jobs");
    expect(result.body).toContain("and more");
    // Should only include first 4 companies
    expect(result.body).toContain("Anthropic");
    expect(result.body).toContain("Cohere");
    expect(result.body).not.toContain("DeepMind");
    expect(result.data.url).toBe("/");
  });

  // Test 3: 2-4 jobs
  it("2–4 jobs: 'N new jobs' title, company names in body, '/' url", () => {
    const jobs: NotificationJob[] = [
      { company: "Anthropic", title: "SWE Backend", jobId: "10" },
      { company: "OpenAI", title: "SWE Frontend", jobId: "11" },
      { company: "Mistral", title: "ML Engineer", jobId: "12" },
    ];
    const result = buildNotificationPayload(jobs);
    expect(result.title).toBe("3 new jobs");
    expect(result.body).toContain("Anthropic");
    expect(result.body).toContain("OpenAI");
    expect(result.body).toContain("Mistral");
    expect(result.body).not.toContain("and more");
    expect(result.data.url).toBe("/");
  });
});

// ─── sendPushNotification tests ──────────────────────────────────────────────

const MOCK_SUBSCRIPTION: PushSubscription = {
  endpoint: "https://push.example.com/v1/send/sub123",
  keys: {
    p256dh:
      "BDthKSn35TQLXUcgRuaAaS0dmaUE2e53yD1TBJ1PLYZ6F5Qg8Zx_J---3G-7CBXBme1EBPkqVgVPDeFm9E5m6UM",
    auth: "AAECAwQFBgcICQoLDA0ODw",
  },
};

// Valid P-256 VAPID keys generated for this test suite (test-only, not secrets).
const MOCK_VAPID: VapidConfig = {
  subject: "mailto:test@example.com",
  // Uncompressed P-256 public key (base64url, 65 bytes starting with 0x04)
  publicKey:
    "BDthKSn35TQLXUcgRuaAaS0dmaUE2e53yD1TBJ1PLYZ6F5Qg8Zx_J---3G-7CBXBme1EBPkqVgVPDeFm9E5m6UM",
  // 32-byte private scalar d (base64url)
  privateKey: "SLixpHeAFbjntXnIvTWgggZd2zLAJhigWnYkBJOWs8c",
};

describe("sendPushNotification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test 4: Sends POST to the subscription endpoint
  it("sends a POST request to the subscription endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 201 })
    );

    const payload = buildNotificationPayload([
      { company: "Anthropic", title: "SWE", jobId: "x1" },
    ]);

    await sendPushNotification(MOCK_SUBSCRIPTION, payload, MOCK_VAPID);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(MOCK_SUBSCRIPTION.endpoint);
    expect((init as RequestInit).method).toBe("POST");
  });

  it("returns result.ok=true when push service responds with 2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 201 })
    );

    const payload = buildNotificationPayload([
      { company: "Anthropic", title: "SWE", jobId: "x2" },
    ]);

    const result = await sendPushNotification(MOCK_SUBSCRIPTION, payload, MOCK_VAPID);
    expect(result.ok).toBe(true);
  });

  it("returns result.ok=false when push service responds with 4xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 410 })
    );

    const payload = buildNotificationPayload([
      { company: "Anthropic", title: "SWE", jobId: "x3" },
    ]);

    const result = await sendPushNotification(MOCK_SUBSCRIPTION, payload, MOCK_VAPID);
    expect(result.ok).toBe(false);
  });
});
