/**
 * One idea, one icon, on every platform: Phosphor on iOS and the web, so the
 * brand looks the same everywhere (owner, 2026-10-12). Resting icons are
 * Regular, a selected tab is Fill, and Bold is for small marks that need
 * weight. Where iOS draws for us (long-press menus), items are text only
 * rather than mixing in another icon style.
 *
 * Application stages are drawn as Pinkslip's own ring (it fills as an
 * application advances), not as icons; saved jobs use the bookmark, since
 * saving isn't a stage.
 */
export const ICONS = {
  // The tab bar and the navigation bar
  jobs: "Briefcase",
  search: "MagnifyingGlass",
  tracker: "Path",
  you: "UserCircle",
  editSearch: "SlidersHorizontal",
  notifications: "Bell",
  back: "CaretLeft",
  close: "X",
  more: "DotsThree",
  share: "Export",
  disclosure: "CaretRight",
  recent: "ClockCounterClockwise",
  add: "Plus",
  website: "ArrowUpRight",
  stats: "ChartBar",

  // A job and what you do with it
  save: "BookmarkSimple",
  saved: "BookmarkSimple",
  ghosted: "Ghost",
  apply: "ArrowSquareOut",
  applied: "CheckCircle",
  done: "Check",
  matches: "CheckCircle",
  hide: "EyeSlash",
  remove: "X",
  notInterested: "ThumbsDown",
  undo: "ArrowCounterClockwise",
  report: "Flag",
  block: "Prohibit",
  tailor: "Sparkle",
  refresh: "ArrowClockwise",
  // Drawn as our own two soft squares on iOS (owner, 2026-10-14); see Icon.tsx.
  copy: "Copy",
  warning: "WarningCircle",

  // Email and people
  email: "EnvelopeSimple",
  /** Swipe a job to mark it read, or unread again (the closed envelope). */
  read: "EnvelopeSimpleOpen",
  unread: "EnvelopeSimple",
  send: "PaperPlaneTilt",
  followUp: "ArrowBendUpLeft",
  recruiter: "IdentificationBadge",
  companies: "Buildings",
  interview: "UsersThree",

  // Facts and settings
  location: "MapPin",
  pay: "CurrencyCircleDollar",
  visa: "GlobeHemisphereWest",
  deadline: "CalendarBlank",
  resume: "FileText",
  answers: "ClipboardText",
  autoApply: "Robot",
  settings: "GearSix",
  signOut: "SignOut",
  plan: "Ticket",
  appearance: "CircleHalf",
  help: "ChatCircleDots",
  admin: "Wrench",
  /** A feature on the way (Tailoring): the wrench is a roadmap signal. */
  soon: "Wrench",
  kit: "Swatches",
  /** A row whose value opens a menu in place (Appearance). */
  pick: "CaretUpDown",
} as const;

export type IconName = keyof typeof ICONS;
export type PhosphorName = (typeof ICONS)[IconName];
