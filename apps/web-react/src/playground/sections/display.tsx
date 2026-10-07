import { Button } from "@pinkslip/ui/button";
import { Accordion, Collapsible } from "@pinkslip/ui/disclosure";
import { ScrollArea, Separator } from "@pinkslip/ui/display";
import { ChevronDownIcon } from "@pinkslip/ui/icons";
import { useToastManager } from "@pinkslip/ui/toast";
import { companies } from "../data";
import { CompanyMark, Group, Row, Specimen } from "../specimen";

const questions = [
  {
    q: "How fast are alerts?",
    a: "Pinkslip reads company career sites directly, every few minutes. Most alerts arrive within five minutes of a job going live.",
  },
  {
    q: "Where do jobs come from?",
    a: "Straight from the hiring system each company uses, such as Greenhouse, Lever, Ashby, and Workday. No job boards in between.",
  },
  {
    q: "What does tailoring change?",
    a: "It reorders and rewords what is already in your master story to match the posting. It never adds experience you did not list.",
  },
];

export function FeedbackGroup() {
  const toasts = useToastManager();

  return (
    <Group id="feedback" title="Feedback">
      <Specimen name="Toast" use="Brief confirmation after an action, with a way to undo. Stacks, and swipes away.">
        <Row>
          <Button
            onClick={() =>
              toasts.add({
                title: "Saved to Library",
                description: "Software Engineer, New Grad at Ramp",
                actionProps: { children: "Undo" },
              })
            }
          >
            Save a job
          </Button>
          <Button
            onClick={() =>
              toasts.add({ title: "Marked applied", description: "Figma moved to Applied." })
            }
          >
            Mark applied
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              ["Datadog", "Notion", "Cloudflare"].forEach((company, index) =>
                window.setTimeout(
                  () => toasts.add({ title: "New match", description: `${company} posted a new-grad role.` }),
                  index * 180,
                ),
              );
            }}
          >
            Send three
          </Button>
        </Row>
      </Specimen>
    </Group>
  );
}

export function DisclosureGroup() {
  return (
    <Group id="disclosure" title="Disclosure">
      <Specimen name="Accordion" use="Questions with answers that open in place.">
        <Accordion.Root className="max-w-110">
          {questions.map(({ q, a }) => (
            <Accordion.Item key={q}>
              <Accordion.Header>
                <Accordion.Trigger>
                  {q}
                  <ChevronDownIcon className="motion-turn shrink-0 text-ink-3 group-data-[panel-open]:rotate-180" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel>
                <p className="pb-4 text-ui text-ink-2">{a}</p>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </Specimen>

      <Specimen name="Collapsible" use="A long job description, trimmed until asked for.">
        <Collapsible.Root className="max-w-110 gap-2">
          <p className="text-ui text-ink-2">
            You will build the systems that move money for 30,000 businesses: card authorization, bill pay, and the
            ledger underneath them.
          </p>
          <Collapsible.Panel>
            <p className="pb-2 text-ui text-ink-2">
              New grads join a team of six, pair with a mentor for the first quarter, and ship to production in their
              first two weeks. You will need one internship or equivalent project in a typed language and comfort with
              SQL.
            </p>
          </Collapsible.Panel>
          <Collapsible.Trigger>
            <span className="group-data-[panel-open]:hidden">Show full description</span>
            <span className="hidden group-data-[panel-open]:inline">Show less</span>
            <ChevronDownIcon size={14} className="motion-turn group-data-[panel-open]:rotate-180" />
          </Collapsible.Trigger>
        </Collapsible.Root>
      </Specimen>
    </Group>
  );
}

export function DisplayGroup() {
  return (
    <Group id="display" title="Display">
      <Specimen name="Avatar" use="Company marks. Initials stand in until a logo loads.">
        <Row>
          {["Ramp", "Figma", "Datadog", "Notion", "Cloudflare"].map((company) => (
            <CompanyMark key={company} company={company} />
          ))}
        </Row>
      </Specimen>

      <Specimen name="Separator" use="A hairline between items in a list or a row of facts.">
        <div className="flex h-5 items-center gap-3 text-meta tabular-nums text-ink-2">
          <span>New York</span>
          <Separator orientation="vertical" />
          <span>$160k–$190k</span>
          <Separator orientation="vertical" />
          <span>Posted 4m ago</span>
        </div>
      </Specimen>

      <Specimen name="Scroll Area" use="A long list in a fixed space, with a scrollbar that appears only while scrolling.">
        <ScrollArea.Root className="h-64 max-w-110 rounded-control border border-line">
          <ScrollArea.Viewport>
            <ScrollArea.Content>
              <ul className="px-3">
                {companies.map((company, index) => (
                  <li key={company}>
                    {index > 0 ? <Separator /> : null}
                    <div className="flex items-center gap-3 py-2.5">
                      <CompanyMark company={company} size="sm" />
                      <span className="text-ui text-ink">{company}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea.Content>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar>
            <ScrollArea.Thumb />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </Specimen>
    </Group>
  );
}
