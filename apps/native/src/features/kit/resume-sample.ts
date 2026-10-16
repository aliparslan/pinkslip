import type { ResumeProfile } from "@pinkslip/core/api";

/** Jordan Lee's resume, as the editors are drawn (Paper "Resume and Answers
 * editors"): a recent grad with a first job, two internships before it. */
export function resumeSample(): ResumeProfile {
  return {
    schemaVersion: 2,
    contact: {
      name: "Jordan Lee", email: "jordan@lee.dev", phone: "(512) 555-0142", location: "Austin, TX",
      linkedin: "linkedin.com/in/jordanlee", github: "github.com/jordanlee", website: "",
    },
    experience: [
      { id: "ramp", company: "Ramp", title: "Software Engineer", location: "New York", startDate: "2025-07", endDate: "Present", bullets: [
        "Built the card-spend export 400 finance teams use each month, in TypeScript and Postgres.",
        "Cut the nightly reconciliation job from 40 minutes to 6 by batching ledger reads.",
      ] },
      { id: "datadog", company: "Datadog", title: "Data Engineering Intern", location: "Boston", startDate: "2024-05", endDate: "2024-08", bullets: [
        "Moved three metrics pipelines from cron to Airflow, with alerts on late data.",
      ] },
      { id: "robotics", company: "Longhorn Robotics", title: "Software Lead", location: "Austin", startDate: "2022-09", endDate: "2025-05", bullets: [] },
    ],
    education: [{
      id: "ut", institution: "The University of Texas at Austin", location: "Austin, TX", startDate: "2021-08", endDate: "2025-05", gpa: "3.8",
      credentials: [{ id: "bs", degreeType: "bachelor", fieldsOfStudy: ["Computer Science"] }], minors: ["Business"],
    }],
    projects: [
      { id: "slipstream", name: "Slipstream", role: "Solo", url: "github.com/jordanlee/slipstream", date: "2025-03", bullets: ["A typed queue for Postgres with retries and a dashboard."] },
      { id: "campus", name: "Campus Eats", role: "Backend", url: "", date: "2024-02", bullets: [] },
      { id: "rover", name: "Mars rover sim", role: "Lead", url: "", date: "2023-04", bullets: [] },
    ],
    skills: [
      { category: "Languages", items: "Python, TypeScript, SQL, Go, Java" },
      { category: "Frameworks", items: "React, Node.js, Django, FastAPI" },
      { category: "Tools", items: "Postgres, Docker, AWS, Git, Figma" },
    ],
    optionalSections: [],
  };
}
