/**
 * Keep the highest-ranked candidates while preventing a deep catalog from one
 * company from owning the first screen. The cap is soft: when supply is thin,
 * skipped rows are added back so the feed never becomes artificially short.
 */
export function diversifyRankedJobs<T extends { company_id: string }>(
  rows: readonly T[],
  limit: number,
  maxCompanyShare = 0.2
): T[] {
  if (limit <= 0 || rows.length === 0) return [];
  const target = Math.min(limit, rows.length);
  const companyCap = Math.max(1, Math.ceil(target * maxCompanyShare));
  const selected: Array<{ row: T; rank: number }> = [];
  const deferred: Array<{ row: T; rank: number }> = [];
  const counts = new Map<string, number>();

  rows.forEach((row, rank) => {
    if (selected.length >= target) {
      deferred.push({ row, rank });
      return;
    }
    const count = counts.get(row.company_id) ?? 0;
    if (count >= companyCap) {
      deferred.push({ row, rank });
      return;
    }
    counts.set(row.company_id, count + 1);
    selected.push({ row, rank });
  });

  for (const candidate of deferred) {
    if (selected.length >= target) break;
    selected.push(candidate);
  }

  // Pull from the company with the most selected rows left, breaking ties by
  // original rank. This prevents a greedy pass from stranding two same-company
  // rows at the end even when a fully interleaved ordering exists.
  const companyQueues = new Map<string, Array<{ row: T; rank: number }>>();
  for (const candidate of selected) {
    const queue = companyQueues.get(candidate.row.company_id) ?? [];
    queue.push(candidate);
    companyQueues.set(candidate.row.company_id, queue);
  }
  const diversified: T[] = [];
  let previousCompany: string | null = null;
  while (diversified.length < selected.length) {
    const available = [...companyQueues.entries()]
      .filter(([, queue]) => queue.length > 0)
      .sort(([, left], [, right]) => right.length - left.length || left[0].rank - right[0].rank);
    const next = available.find(([companyId]) => companyId !== previousCompany) ?? available[0];
    const [companyId, queue] = next;
    diversified.push(queue.shift()!.row);
    previousCompany = companyId;
  }
  return diversified;
}
