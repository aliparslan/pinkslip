import { Heading, Stack, Text } from "../../kit";
import { LinkButton } from "../navigation/LinkButton";
import styles from "./About.module.css";

export const ABOUT_DESCRIPTION = "Pinkslip finds internships, new grad and early-career software jobs on company career pages, alerts you when they open, and keeps your applications in one place.";

/** The public explainer (`about/+page.svelte`), prerendered at build. */
export function About() {
  return <article className={styles.root}>
    <Stack gap="5">
      <Heading level={1} variant="display-lg">Early-career jobs, straight from the source</Heading>
      <Text size="lg" tone="ink-2">
        Pinkslip checks company career pages every 15 minutes for internships, new grad and early-career software roles, and shows only the ones you can apply to.
      </Text>
      <Text tone="ink-2">Turn on alerts to hear about a role as soon as it opens. Save the promising ones, mark what you've applied to, and keep your resume ready for the next application.</Text>
      <div><LinkButton to="/" variant="primary">Browse jobs</LinkButton></div>
    </Stack>
  </article>;
}
