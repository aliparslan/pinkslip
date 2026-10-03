import { expect, test } from "@playwright/test";
import { installApiMocks, smokeJob } from "./api-mocks";

for (const target of ["detail", "feed"] as const) {
  test(`notification targeting ${target} refreshes a recently loaded feed`, async ({ page }) => {
    await installApiMocks(page);
    const notifiedJob = {
      ...smokeJob,
      id: "notified-job",
      title: "Amazon Application Security Engineer",
      company_name: "Amazon",
    };
    let arrived = false;
    let feedRequests = 0;
    await page.route("**/api/v2/jobs?**", async (route) => {
      feedRequests += 1;
      const jobs = arrived ? [notifiedJob, smokeJob] : [smokeJob];
      await route.fulfill({ json: {
        jobs,
        meta: { total: jobs.length, count: jobs.length, has_more: false, next_offset: jobs.length },
      } });
    });
    await page.route(`**/api/v2/jobs/${notifiedJob.id}`, (route) => route.fulfill({ json: notifiedJob }));

    await page.goto("/");
    await expect(page.getByText(smokeJob.title, { exact: true })).toBeVisible();
    expect(feedRequests).toBe(1);
    arrived = true;
    await page.evaluate(({ target, jobId }) => {
      navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: {
        type: "pinkslip:notification-opened",
        url: target === "detail" ? `/jobs/${jobId}` : "/",
        jobIds: [jobId],
      } }));
    }, { target, jobId: notifiedJob.id });

    if (target === "detail") {
      await expect(page).toHaveURL(new RegExp(`/jobs/${notifiedJob.id}$`));
      await expect(page.getByRole("heading", { level: 1, name: notifiedJob.title })).toBeVisible();
      // Fetch on return, rather than disturbing the inactive retained list.
      expect(feedRequests).toBe(1);
      await page.goBack();
    }
    await expect(page.getByText(notifiedJob.title, { exact: true })).toBeVisible();
    expect(feedRequests).toBe(2);

    // Ordinary detail navigation within the cache window still preserves the
    // list, without introducing another notification-driven request.
    await page.getByText(notifiedJob.title, { exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: notifiedJob.title })).toBeVisible();
    await page.goBack();
    await expect(page.getByText(notifiedJob.title, { exact: true })).toBeVisible();
    expect(feedRequests).toBe(2);
  });
}
