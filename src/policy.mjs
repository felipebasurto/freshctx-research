export const DEFAULT_POLICY = Object.freeze({
  budgetChars: 12_000,
  recencyWindow: 12,
  recencyWeight: 4,
  taskOverlapWeight: 8,
  changedWeight: 2,
  pinnedWeight: 100,
  sizePenaltyWeight: 1.5,
});

function terms(value) {
  return new Set(
    String(value ?? "")
      .toLowerCase()
      .match(/[a-z_][a-z0-9_]{2,}/gu) ?? [],
  );
}

export function scoreUnit(unit, { turn = 0, task = "", policy = DEFAULT_POLICY } = {}) {
  if (unit.state !== "resolved") return Number.NEGATIVE_INFINITY;

  const effective = { ...DEFAULT_POLICY, ...policy };
  const taskTerms = terms(task);
  const unitTerms = terms(`${unit.path}\n${unit.selector ?? ""}\n${unit.content}`);
  let overlap = 0;
  for (const term of taskTerms) {
    if (unitTerms.has(term)) overlap += 1;
  }

  const age = Math.max(0, turn - unit.lastUsedAt);
  const recency = Math.max(0, 1 - age / Math.max(1, effective.recencyWindow));
  const normalizedSize = unit.content.length / Math.max(1, effective.budgetChars);

  return (
    recency * effective.recencyWeight +
    overlap * effective.taskOverlapWeight +
    (unit.changedAt === turn ? effective.changedWeight : 0) +
    (unit.pinned ? effective.pinnedWeight : 0) -
    normalizedSize * effective.sizePenaltyWeight
  );
}

export function refreshedThisTurn(unit, turn) {
  return unit?.state === "resolved"
    && Number(unit.changeCount) >= 1
    && unit.changedAt === turn;
}

function selectionSize(unit) {
  return String(unit.content ?? "").length;
}

export function selectWorkingSet(
  units,
  { turn = 0, task = "", budgetChars, policy = {} } = {},
) {
  const effective = {
    ...DEFAULT_POLICY,
    ...policy,
    ...(budgetChars === undefined ? {} : { budgetChars }),
  };
  const ranked = units
    .map((unit) => ({ unit, score: scoreUnit(unit, { turn, task, policy: effective }) }))
    .sort((a, b) =>
      Number(b.unit.pinned) - Number(a.unit.pinned) ||
      b.score - a.score ||
      a.unit.id.localeCompare(b.unit.id),
    );

  const selected = [];
  const omitted = [];
  const selectedIds = new Set();
  let usedChars = 0;

  for (const candidate of ranked) {
    if (!Number.isFinite(candidate.score)) {
      omitted.push({ ...candidate, reason: "unresolved" });
      continue;
    }
    if (!refreshedThisTurn(candidate.unit, turn)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.unit.id);
    usedChars += selectionSize(candidate.unit);
  }

  for (const candidate of ranked) {
    if (selectedIds.has(candidate.unit.id)) continue;
    if (!Number.isFinite(candidate.score)) continue;

    const size = selectionSize(candidate.unit);
    if (size > 0 && usedChars + size > effective.budgetChars) {
      omitted.push({ ...candidate, reason: "budget" });
      continue;
    }

    selected.push(candidate);
    selectedIds.add(candidate.unit.id);
    usedChars += size;
  }

  return { selected, omitted, usedChars, budgetChars: effective.budgetChars };
}
