/**
 * One idea, one icon, on every platform. iOS draws Apple's SF Symbols (the
 * system's own bars, menus and share sheet use them, so ours match), and the
 * web draws Phosphor Regular. Each idea names its symbol in both sets here,
 * so the two apps stay on the same metaphor even where the shapes differ.
 *
 * Application stages are drawn as Pinkslip's own ring (it fills as an
 * application advances), not as icons; saved jobs use the bookmark, since
 * saving isn't a stage.
 */
export const ICONS = {
  // The tab bar and the navigation bar
  jobs: { sf: "briefcase", phosphor: "Briefcase" },
  search: { sf: "magnifyingglass", phosphor: "MagnifyingGlass" },
  tracker: { sf: "rectangle.stack", phosphor: "Cards" },
  you: { sf: "person.crop.circle", phosphor: "UserCircle" },
  editSearch: { sf: "slider.horizontal.3", phosphor: "SlidersHorizontal" },
  notifications: { sf: "bell", phosphor: "Bell" },
  back: { sf: "arrow.left", phosphor: "ArrowLeft" },
  more: { sf: "ellipsis", phosphor: "DotsThree" },
  share: { sf: "square.and.arrow.up", phosphor: "Export" },
  disclosure: { sf: "chevron.right", phosphor: "CaretRight" },

  // A job and what you do with it
  save: { sf: "bookmark", phosphor: "BookmarkSimple" },
  saved: { sf: "bookmark.fill", phosphor: "BookmarkSimple" },
  apply: { sf: "arrow.up.right.square", phosphor: "ArrowSquareOut" },
  applied: { sf: "checkmark.circle", phosphor: "CheckCircle" },
  done: { sf: "checkmark", phosphor: "Check" },
  matches: { sf: "checkmark.circle", phosphor: "CheckCircle" },
  hide: { sf: "eye.slash", phosphor: "EyeSlash" },
  remove: { sf: "xmark", phosphor: "X" },
  notInterested: { sf: "hand.thumbsdown", phosphor: "ThumbsDown" },
  undo: { sf: "arrow.uturn.backward", phosphor: "ArrowCounterClockwise" },
  report: { sf: "flag", phosphor: "Flag" },
  block: { sf: "nosign", phosphor: "Prohibit" },
  tailor: { sf: "sparkles", phosphor: "Sparkle" },
  refresh: { sf: "arrow.clockwise", phosphor: "ArrowClockwise" },
  warning: { sf: "exclamationmark.circle", phosphor: "WarningCircle" },

  // Email and people
  email: { sf: "envelope", phosphor: "EnvelopeSimple" },
  send: { sf: "paperplane", phosphor: "PaperPlaneTilt" },
  followUp: { sf: "arrowshape.turn.up.left", phosphor: "ArrowBendUpLeft" },
  recruiter: { sf: "person.text.rectangle", phosphor: "IdentificationBadge" },
  companies: { sf: "building.2", phosphor: "Buildings" },
  interview: { sf: "person.2", phosphor: "UsersThree" },

  // Facts and settings
  location: { sf: "mappin", phosphor: "MapPin" },
  pay: { sf: "dollarsign.circle", phosphor: "CurrencyCircleDollar" },
  visa: { sf: "globe", phosphor: "GlobeHemisphereWest" },
  deadline: { sf: "calendar", phosphor: "CalendarBlank" },
  resume: { sf: "doc.text", phosphor: "FileText" },
  answers: { sf: "text.bubble", phosphor: "ChatText" },
  autoApply: { sf: "bolt", phosphor: "Lightning" },
  settings: { sf: "gearshape", phosphor: "GearSix" },
  signOut: { sf: "rectangle.portrait.and.arrow.right", phosphor: "SignOut" },
} as const;

export type IconName = keyof typeof ICONS;
