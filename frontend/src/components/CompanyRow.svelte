<script lang="ts">
  let {
    company,
    onToggle,
  }: {
    company: any;
    onToggle: (id: string, enabled: boolean) => void;
  } = $props();

  const atsBadgeClass: Record<string, string> = {
    greenhouse: "badge-info",
    lever: "badge-secondary",
    ashby: "badge-accent",
    custom: "badge-neutral",
  };
</script>

<div class="flex items-center justify-between py-3 px-4 bg-base-200 rounded-lg">
  <div class="flex items-center gap-3">
    <span class="font-medium">{company.name}</span>
    <span class="badge badge-sm {atsBadgeClass[company.ats_type] ?? 'badge-neutral'}">
      {company.ats_type}
    </span>
  </div>
  <input
    type="checkbox"
    class="toggle toggle-sm toggle-primary"
    checked={company.enabled}
    onchange={(e) => onToggle(company.id, (e.target as HTMLInputElement).checked)}
  />
</div>
