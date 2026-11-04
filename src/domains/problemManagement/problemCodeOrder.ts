type CodedProblem = { problem_code: string; problem_id?: string | null };

/** Match the server's plain Unicode lexicographic order, including A1, A10, A2. */
export function compareProblemCodes(left: string, right: string) {
  const a = Array.from(left, (character) => character.codePointAt(0)!);
  const b = Array.from(right, (character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return a.length - b.length;
}

export function compareProblemsByCode(left: CodedProblem, right: CodedProblem) {
  return (
    compareProblemCodes(left.problem_code, right.problem_code) ||
    compareProblemCodes(left.problem_id ?? '', right.problem_id ?? '')
  );
}

export function sortProblemsByCode<T extends CodedProblem>(
  problems: readonly T[],
) {
  return [...problems].sort(compareProblemsByCode);
}
