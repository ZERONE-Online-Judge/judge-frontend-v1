import type { JudgeLanguage } from '@/domains/submissionScoreboard/types';

const LANGUAGE_LABELS: Record<JudgeLanguage, string> = {
  c99: 'C99',
  pypy3: 'PyPy 3.11 (8.0.1)',
  kotlin: 'Kotlin 1.9.24',
  cpp17: 'C++17',
  python311: 'Python 3.11',
  python313: 'Python 3.13 (이전 환경)',
  java8: 'Java 8',
};

export function judgeLanguageLabel(language: string) {
  return Object.hasOwn(LANGUAGE_LABELS, language)
    ? LANGUAGE_LABELS[language as JudgeLanguage]
    : language;
}
