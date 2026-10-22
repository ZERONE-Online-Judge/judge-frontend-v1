import type { JudgeLanguage } from '@/domains/submissionScoreboard/types';

export const judgeLanguages: JudgeLanguage[] = [
  'cpp17',
  'python311',
  'java8',
  'c99',
  'pypy3',
  'kotlin',
];

const LAST_JUDGE_LANGUAGE_KEY = 'zoj.lastJudgeLanguage';
const DEFAULT_JUDGE_LANGUAGE: JudgeLanguage = 'cpp17';

export function isJudgeLanguage(value?: string | null): value is JudgeLanguage {
  return judgeLanguages.includes(value as JudgeLanguage);
}

export function loadLastJudgeLanguage(): JudgeLanguage {
  if (typeof window === 'undefined') return DEFAULT_JUDGE_LANGUAGE;

  const value = window.localStorage.getItem(LAST_JUDGE_LANGUAGE_KEY);
  if (value === 'python313') return 'python311';
  return isJudgeLanguage(value) ? value : DEFAULT_JUDGE_LANGUAGE;
}

export function saveLastJudgeLanguage(language: JudgeLanguage) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(LAST_JUDGE_LANGUAGE_KEY, language);
}
