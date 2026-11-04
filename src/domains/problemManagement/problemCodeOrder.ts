type CodedProblem = { problem_code: string; problem_id?: string | null };

function compareOrdinal(left: string, right: string) {
  const a = Array.from(left, (character) => character.codePointAt(0)!);
  const b = Array.from(right, (character) => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return a.length - b.length;
}

function isAsciiDigit(character: string) {
  const code = character.charCodeAt(0);
  return code >= 48 && code <= 57;
}

/** Match the server's numeric code ordering without Number/locale precision limits. */
export function compareProblemCodes(left: string, right: string) {
  const a = Array.from(left);
  const b = Array.from(right);
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    if (isAsciiDigit(a[i]) && isAsciiDigit(b[j])) {
      let endA = i,
        endB = j;
      while (endA < a.length && isAsciiDigit(a[endA])) endA++;
      while (endB < b.length && isAsciiDigit(b[endB])) endB++;
      const numberA = a.slice(i, endA).join('').replace(/^0+/, '') || '0';
      const numberB = b.slice(j, endB).join('').replace(/^0+/, '') || '0';
      const numeric =
        numberA.length - numberB.length || compareOrdinal(numberA, numberB);
      if (numeric) return numeric;
      i = endA;
      j = endB;
      continue;
    }
    const ordinal = a[i].codePointAt(0)! - b[j].codePointAt(0)!;
    if (ordinal) return ordinal;
    i++;
    j++;
  }
  if (i < a.length) return 1;
  if (j < b.length) return -1;
  return compareOrdinal(left, right);
}

export function compareProblemsByCode(left: CodedProblem, right: CodedProblem) {
  return (
    compareProblemCodes(left.problem_code, right.problem_code) ||
    compareOrdinal(left.problem_id ?? '', right.problem_id ?? '')
  );
}

export function sortProblemsByCode<T extends CodedProblem>(
  problems: readonly T[],
) {
  return [...problems].sort(compareProblemsByCode);
}
