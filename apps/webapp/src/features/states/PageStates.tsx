import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowClockwise, Briefcase, Compass, WarningCircle } from "@phosphor-icons/react";
import { Button, EmptyState } from "../../kit";
import { LinkButton } from "../navigation/LinkButton";

/** Unknown paths. The server already answers these with a 404 status. */
export function NotFoundPage() {
  return <EmptyState
    level={1}
    icon={Compass}
    title="Page not found"
    message="That link doesn't go anywhere. It may have moved."
    actions={<LinkButton to="/" variant="primary">Back to Jobs</LinkButton>}
  />;
}

/** A job id that doesn't exist or is no longer listed (also a 404). */
export function JobNotFoundPage() {
  return <EmptyState
    level={1}
    icon={Briefcase}
    title="This job isn't available"
    message="It may have closed or been taken down by the company."
    actions={<LinkButton to="/" variant="primary">Browse jobs</LinkButton>}
  />;
}

/** Any route that throws while loading or rendering. Retry reloads the
 * route's data and clears the error. */
export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <EmptyState
    level={1}
    alert
    icon={WarningCircle}
    title="Something went wrong"
    message="This page didn't load. Try again, or come back in a minute."
    actions={<>
      <Button variant="secondary" icon={ArrowClockwise} onClick={() => {
        reset();
        void router.invalidate();
      }}>Try again</Button>
      <LinkButton to="/" variant="secondary">Back to Jobs</LinkButton>
    </>}
  />;
}
