/**
 * One idea, one icon, on every platform: Phosphor on iOS and the web, so the
 * brand looks the same everywhere (owner, 2026-10-12). Resting icons are
 * Regular, a selected tab is Fill, and Bold is for small marks that need
 * weight. iOS's own menus use the same Phosphor icons, from the app's asset
 * catalog (owner, 2026-10-16), rather than mixing in another icon style.
 *
 * Application stages are drawn as Pinkslip's own ring (it fills as an
 * application advances), not as icons; saved jobs use the bookmark, since
 * saving isn't a stage.
 *
 * `scripts/check-icons.ts` (part of `bun run check`) holds every screen to
 * this table: a Phosphor icon that isn't here, one of Apple's SF Symbols on
 * iOS, or a menu image that isn't its Phosphor glyph fails the check.
 */
export const ICONS = {
  // The tab bar and the navigation bar
  today: "CalendarBlank",
  jobs: "Briefcase",
  search: "MagnifyingGlass",
  tracker: "BookmarkSimple",
  you: "UserCircle",
  editSearch: "SlidersHorizontal",
  notifications: "Bell",
  back: "CaretLeft",
  close: "X",
  more: "DotsThree",
  info: "Info",
  caution: "Warning",
  /** The website's name for Tracker: the same idea, the same icon. */
  library: "BookmarksSimple",
  /** Moving an application to another stage (iOS's menu image). */
  move: "Path",
  /** The website's page-not-found. */
  notFound: "Compass",
  edit: "PencilSimple",
  delete: "Trash",
  upload: "UploadSimple",
  /** Peek at a job from a long press. */
  preview: "Eye",
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
  /** The iOS undo arrow (Paper "Toast · Oct 14"). */
  undo: "ArrowUUpLeft",
  report: "Flag",
  block: "Prohibit",
  tailor: "Sparkle",
  refresh: "ArrowClockwise",
  // Drawn as our own two soft squares on iOS (owner, 2026-10-14); see Icon.tsx.
  copy: "Copy",
  warning: "WarningCircle",
  offline: "CloudSlash",

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
  deadline: "Hourglass",
  /** Add to Calendar under the Next interview row, then In your calendar. */
  calendarAdd: "CalendarPlus",
  calendarAdded: "CalendarCheck",
  resume: "FileText",
  answers: "ClipboardText",
  /** Drawn as Pinkslip's own bot mark on iOS (B2, owner 2026-10-14); see Icon.tsx. */
  autoApply: "Robot",
  settings: "GearSix",
  signOut: "SignOut",
  plan: "Ticket",
  appearance: "CircleHalf",
  /** You → Swipe actions (owner, 2026-11-08). */
  swipes: "HandSwipeRight",
  help: "ChatCircleDots",
  whatsNew: "Gift",
  /** Support Pinkslip: filled on its pink tile and in the thank-you toast
   * (owner, 2026-10-22). */
  support: "Heart",
  admin: "Wrench",
  /** Admin's tools (Paper "Admin · Oct 16"). */
  flagged: "Funnel",
  jev: "Scales",
  runs: "ArrowsClockwise",
  /** A feature on the way (Tailoring): the wrench is a roadmap signal. */
  soon: "Wrench",
  kit: "Swatches",
  /** A row whose value opens a menu in place (Appearance). */
  pick: "CaretUpDown",
  /** Down and up: a split button's other choices (Apply for me ▾), and the
   * fill bar's next and previous blank. */
  down: "CaretDown",
  up: "CaretUp",
  /** A secure page's address (the in-app browser's header). */
  secure: "Lock",
  /** Sent, waiting for the company to confirm it (the Apply button). */
  waiting: "Clock",
  /** A send found the posting closed (its toast). */
  postingClosed: "XCircle",
} as const;

export type IconName = keyof typeof ICONS;
export type PhosphorName = (typeof ICONS)[IconName];
