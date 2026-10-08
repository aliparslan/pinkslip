import { Button } from "@pinkslip/ui/button";
import { ChoiceLabel, Switch } from "@pinkslip/ui/choice";
import { Badge } from "@pinkslip/ui/display";
import { Spinner } from "@pinkslip/ui/loading";
import { useState } from "react";
import { CompanyMark } from "../../components/company-mark";
import { JobList } from "../../components/job-list";
import { sampleJobs } from "../data";
import { DemoFeedRows, useDemoFeed } from "../demo-feed";
import { Group, Row, Specimen } from "../specimen";

/* The parts that pages are built from, smallest first. Everything here is in
   review (packages/ui README, Quarantine) until approved. */

export function PartsGroup() {
  return (
    <Group id="parts" title="Parts">
      <Specimen
        name="Badge"
        use="A short fact or status on a job or company. Neutral for most, green for good news, amber and red only for problems. Never a button."
      >
        <Row>
          <Badge>Closed</Badge>
          <Badge>Evergreen</Badge>
          <Badge>Hidden</Badge>
          <Badge tone="good">Sponsorship available</Badge>
          <Badge tone="accent">3 new</Badge>
          <Badge tone="warn">Paused</Badge>
          <Badge tone="bad">Source error</Badge>
        </Row>
      </Specimen>

      <Specimen
        name="Company mark"
        use="The company's logo, with its initials until the logo loads. Small in toasts and lists of companies, medium in feed rows, large on a job's page."
      >
        <Row className="items-end gap-4">
          <CompanyMark name="Ramp" size="sm" />
          <CompanyMark name="Ramp" />
          <CompanyMark name="Ramp" size="lg" />
          <CompanyMark name="Jane Street" size="lg" />
        </Row>
      </Specimen>

      <Specimen
        name="Spinner"
        use="Short waits with nothing to preview: a button that is working, a description being fetched. Longer waits keep their shape with skeletons."
      >
        <Row className="gap-4">
          <Spinner label="Loading" />
          <Spinner size={20} label="Loading" className="text-ink-3" />
          <Button variant="primary" disabled focusableWhenDisabled>
            <Spinner />
            Applying…
          </Button>
        </Row>
        <p className="flex items-center gap-2 text-ui text-ink-2">
          <Spinner className="text-ink-3" />
          Pulling the full posting now…
        </p>
      </Specimen>

      <Specimen
        name="Job row"
        use="The feed, Saved, and Applied lists. Two lines beside the company mark: the title, then company, place, and pay. The right edge is status: the age, and a bookmark when saved. New jobs get a pink dot on the logo until opened."
      >
        <FeedDemo />
      </Specimen>
    </Group>
  );
}

function FeedDemo() {
  const feed = useDemoFeed(sampleJobs);
  const [loading, setLoading] = useState(false);
  const [admin, setAdmin] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <ChoiceLabel control={<Switch checked={loading} onCheckedChange={setLoading} />} label="Loading" />
        <ChoiceLabel control={<Switch checked={admin} onCheckedChange={setAdmin} />} label="Admin" />
        <Button size="sm" variant="ghost" onClick={feed.reset} className="ml-auto">
          Reset list
        </Button>
      </div>
      <JobList label="Jobs">
        <DemoFeedRows feed={feed} loading={loading} admin={admin} />
      </JobList>
      <p className="text-meta text-ink-3">
        Ramp, Figma, and Notion are new. Datadog and Cloudflare were opened before. Figma is saved, and Plaid's listing
        has closed. Click a row to open it beside the list; on desktop, hover for Save, Hide, and More, or right-click
        for everything.
      </p>
    </div>
  );
}
