export const PROBLEM_CODE_MAX_LENGTH = 16;
export const PROBLEM_CODE_HINT =
  '영문·숫자 1~16자 · 영문은 대문자로 자동 변환됩니다.';

export function normalizeProblemCode(value: string) {
  // Unicode uppercasing can turn invalid input such as ß into valid ASCII.
  return value.replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

export function problemCodeError(value: string) {
  if (!value) return '문제 번호를 입력해 주세요.';
  if (value.length > PROBLEM_CODE_MAX_LENGTH)
    return '문제 번호는 16자 이하로 입력해 주세요.';
  if (!/^[A-Za-z0-9]+$/.test(value))
    return '문제 번호는 영문·숫자만 입력할 수 있습니다.';
  return '';
}

export function uniqueProblemCode(
  baseCode: string,
  existingCodes: Set<string>,
) {
  const normalized = normalizeProblemCode(baseCode);
  const base = /^[A-Z0-9]+$/.test(normalized)
    ? normalized.slice(0, PROBLEM_CODE_MAX_LENGTH)
    : 'COPY';
  const used = new Set([...existingCodes].map(normalizeProblemCode));
  if (!used.has(base)) return base;
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? 'COPY' : `COPY${index}`;
    const candidate =
      base.slice(0, PROBLEM_CODE_MAX_LENGTH - suffix.length) + suffix;
    if (!used.has(candidate)) return candidate;
  }
}
