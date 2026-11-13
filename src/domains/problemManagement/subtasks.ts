import type { SubtaskDefinition } from './types';

export type SubtaskDraft = {
  id: string;
  name: string;
  points: string;
  testcases: string;
};

export function subtaskDrafts(groups: SubtaskDefinition[]): SubtaskDraft[] {
  return groups.map((group) => ({
    id: group.subtask_id,
    name: group.name,
    points: String(group.points),
    testcases: group.testcase_orders.join(', '),
  }));
}

export function parseSubtaskOrders(raw: string): number[] | null {
  const result = new Set<number>();
  for (const token of raw
    .trim()
    .split(/[\s,，·]+/)
    .filter(Boolean)) {
    const match = /^(\d+)(?:\s*[-~]\s*(\d+))?$/.exec(token);
    if (!match) return null;
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(last) ||
      first < 1 ||
      last < first ||
      last - first > 100000
    )
      return null;
    for (let value = first; value <= last; value++) result.add(value);
  }
  return [...result].sort((a, b) => a - b);
}

export function validateSubtaskDrafts(
  drafts: SubtaskDraft[],
  testcaseOrders: number[],
): { groups: SubtaskDefinition[]; error: string | null } {
  const fail = (error: string) => ({ groups: [], error });
  if (!drafts.length) return { groups: [], error: null };
  if (drafts.length > 100)
    return fail('서브태스크는 최대 100개까지 추가할 수 있습니다.');
  const available = new Set(testcaseOrders);
  const ids = new Set<string>();
  const groups: SubtaskDefinition[] = [];
  for (const [index, draft] of drafts.entries()) {
    const label = `${index + 1}번 서브태스크`;
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(draft.id) ||
      ids.has(draft.id)
    )
      return fail(`${label}: 고유한 식별자가 필요합니다.`);
    ids.add(draft.id);
    if (!draft.name.trim() || draft.name.trim().length > 120)
      return fail(`${label}: 이름을 120자 이내로 입력하세요.`);
    if (
      !/^\d+$/.test(draft.points) ||
      Number(draft.points) < 1 ||
      Number(draft.points) > 100
    )
      return fail(`${label}: 배점은 1~100의 정수로 입력하세요.`);
    const orders = parseSubtaskOrders(draft.testcases);
    if (!orders?.length)
      return fail(`${label}: 테스트 번호를 입력하세요. 예: 1-5, 8, 10`);
    const missing = orders.filter((order) => !available.has(order));
    if (missing.length)
      return fail(
        `${label}: 없는 테스트 번호입니다 (${missing.slice(0, 5).join(', ')}).`,
      );
    groups.push({
      subtask_id: draft.id,
      name: draft.name.trim(),
      points: Number(draft.points),
      testcase_orders: orders,
    });
  }
  if (groups.reduce((sum, group) => sum + group.points, 0) !== 100)
    return fail('서브태스크 배점의 합계가 100점이어야 합니다.');
  const covered = new Set(groups.flatMap((group) => group.testcase_orders));
  const uncovered = testcaseOrders.filter((order) => !covered.has(order));
  if (uncovered.length)
    return fail(
      `배정하지 않은 테스트가 있습니다: ${uncovered.slice(0, 10).join(', ')}${uncovered.length > 10 ? ' 외' : ''}`,
    );
  return { groups, error: null };
}

/** Group identifiers are stable metadata, not credentials. Works on VPN HTTP previews too. */
export function nextSubtaskId(existing: string[]): string {
  const used = new Set(existing);
  let index = 1;
  while (used.has(`st${index}`)) index++;
  return `st${index}`;
}
