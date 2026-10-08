import type { SVGProps } from "react";

/* A small, deliberate stroke set for control affordances only. Product icons
   come later, once an icon family is chosen. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="M3.5 8.5l3 3 6-7" /></Icon>;
export const DashIcon = (p: IconProps) => <Icon {...p}><path d="M4 8h8" /></Icon>;
export const ChevronDownIcon = (p: IconProps) => <Icon {...p}><path d="M4 6l4 4 4-4" /></Icon>;
export const ChevronRightIcon = (p: IconProps) => <Icon {...p}><path d="M6 4l4 4-4 4" /></Icon>;
export const ChevronUpDownIcon = (p: IconProps) => <Icon {...p}><path d="M5 6l3-3 3 3M5 10l3 3 3-3" /></Icon>;
export const CloseIcon = (p: IconProps) => <Icon {...p}><path d="M4 4l8 8M12 4l-8 8" /></Icon>;
export const PlusIcon = (p: IconProps) => <Icon {...p}><path d="M8 3.5v9M3.5 8h9" /></Icon>;
export const MinusIcon = (p: IconProps) => <Icon {...p}><path d="M3.5 8h9" /></Icon>;
export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="7" cy="7" r="4" /><path d="M10 10l3 3" /></Icon>;
export const BookmarkIcon = (p: IconProps) => <Icon {...p}><path d="M4.5 2.5h7v11L8 11l-3.5 2.5z" /></Icon>;
export const ShareIcon = (p: IconProps) => <Icon {...p}><path d="M8 2.5v8M5 5.5l3-3 3 3M3.5 9v4h9V9" /></Icon>;
export const MoreIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={0} fill="currentColor">
    <circle cx="3.5" cy="8" r="1.25" />
    <circle cx="8" cy="8" r="1.25" />
    <circle cx="12.5" cy="8" r="1.25" />
  </Icon>
);
export const BellIcon = (p: IconProps) => <Icon {...p}><path d="M4 11V7a4 4 0 018 0v4l1 1.5H3zM6.5 13.5a1.5 1.5 0 003 0" /></Icon>;
export const HideIcon = (p: IconProps) => <Icon {...p}><path d="M2 8s2.2-4 6-4c1.1 0 2.1.3 2.9.8M14 8s-2.2 4-6 4c-1.1 0-2.1-.3-2.9-.8M6.6 9.4a2 2 0 012.8-2.8M2.5 13.5l11-11" /></Icon>;
export const SlidersIcon = (p: IconProps) => <Icon {...p}><path d="M3 5h6M12 5h1M3 11h1M7 11h6" /><circle cx="10.5" cy="5" r="1.5" /><circle cx="5.5" cy="11" r="1.5" /></Icon>;
