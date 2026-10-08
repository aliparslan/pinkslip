import { companyMark } from "@pinkslip/core/utils";
import { Avatar, type AvatarSize } from "@pinkslip/ui/display";

/** A company's logo, with its initials until (or unless) the logo loads.
 * The caller supplies `src`, since where logos come from is the app's
 * business; without one the initials stand on their own. */
export function CompanyMark({ name, src, size = "md" }: { name: string; src?: string; size?: AvatarSize }) {
  return (
    <Avatar.Root size={size}>
      {src ? <Avatar.Image src={src} alt="" /> : null}
      <Avatar.Fallback delay={src ? 250 : undefined}>{companyMark(name)}</Avatar.Fallback>
    </Avatar.Root>
  );
}
