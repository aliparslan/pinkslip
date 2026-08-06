const SOURCE_LABELS: Record<string, string> = {
  All: "All sources",
  ashby: "Ashby",
  custom: "Custom",
  gem: "Gem",
  greenhouse: "Greenhouse",
  lever: "Lever",
  rippling: "Rippling",
  smartrecruiters: "SmartRecruiters",
  workday: "Workday",
  yc: "Y Combinator",
};

export function companySourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
