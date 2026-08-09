import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createEmptyResumeProfile } from "../shared/resume-profile";
import profileRoutes from "../worker/routes/profile";
import type { Env, Variables } from "../worker/types";

function profileDb(): D1Database {
  const stored = {
    ...createEmptyResumeProfile(),
    education: [{
      id: "school-1",
      institution: "Example University",
      credentials: [
        { id: "degree-1", degreeType: "bachelor", fieldsOfStudy: ["Computer Science"] },
        { id: "degree-2", degreeType: "master", fieldsOfStudy: ["Data Science"] },
      ],
      minors: ["Design"],
      location: "Austin, TX",
      startDate: "2018",
      endDate: "2024",
    }],
  };
  return {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        async first<T>() {
          return {
            user_id: "user-1",
            data: JSON.stringify(stored),
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          } as T;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

function app() {
  const application = new Hono<{ Bindings: Env; Variables: Variables }>();
  application.use("*", async (context, next) => {
    context.set("userId", "user-1");
    context.set("sessionId", "session-1");
    context.set("sessionState", "authenticated");
    context.set("authTransport", "native");
    await next();
  });
  application.route("/profile", profileRoutes);
  return application;
}

async function getProfile(headers?: HeadersInit) {
  const application = app();
  return (application.fetch as unknown as (
    request: Request,
    env: Env,
  ) => Promise<Response>)(new Request("https://pinkslip.test/profile", { headers }), {
    DB: profileDb(),
  } as Env);
}

describe("profile API compatibility", () => {
  test("gives installed clients the degree aliases their resume screen requires", async () => {
    const response = await getProfile({ "X-Pinkslip-Client": "ios" });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      data: { education: Array<Record<string, unknown>> };
    };
    expect(body.data.education[0]).toMatchObject({
      degree: "Bachelor's degree in Computer Science",
      degreeType: "bachelor",
      fieldOfStudy: "Computer Science",
    });
    expect(body.data.education[0].credentials).toHaveLength(2);
    expect(body.data.education[0].minors).toEqual(["Design"]);
  });

  test("returns the pure canonical schema to current clients", async () => {
    const response = await getProfile({ "X-Pinkslip-Api-Version": "2" });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      data: { schemaVersion: number; education: Array<Record<string, unknown>> };
    };
    expect(body.data.schemaVersion).toBe(2);
    expect(body.data.education[0].degree).toBeUndefined();
    expect(body.data.education[0].credentials).toHaveLength(2);
  });
});
