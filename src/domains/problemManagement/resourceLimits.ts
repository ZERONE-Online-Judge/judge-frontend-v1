import { judgeLanguageLabel } from '@/domains/submissionScoreboard/languageLabel';
import type { Problem } from '@/domains/problemManagement/types';
import type { JudgeLanguage } from '@/domains/submissionScoreboard/types';

const LANGUAGE_ORDER: JudgeLanguage[] = [
  'cpp17',
  'python311',
  'java8',
  'c99',
  'pypy3',
  'kotlin',
];

const LANGUAGE_TIME_ADJUSTMENTS: Partial<
  Record<JudgeLanguage, { multiplier: number; bonusMs: number }>
> = {
  java8: { multiplier: 2, bonusMs: 1000 },
  python311: { multiplier: 3, bonusMs: 2000 },
  python313: { multiplier: 3, bonusMs: 2000 },
  pypy3: { multiplier: 3, bonusMs: 2000 },
  kotlin: { multiplier: 2, bonusMs: 1000 },
};

const LANGUAGE_MEMORY_ADJUSTMENTS: Partial<
  Record<JudgeLanguage, { multiplier: number; bonusMb: number }>
> = {
  java8: { multiplier: 2, bonusMb: 16 },
  python311: { multiplier: 2, bonusMb: 32 },
  python313: { multiplier: 2, bonusMb: 32 },
  pypy3: { multiplier: 2, bonusMb: 128 },
  kotlin: { multiplier: 2, bonusMb: 16 },
};

function formatTime(ms: number) {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
}

function formatMemory(memoryMb: number) {
  return `${memoryMb}MB`;
}

type LimitLabelOptions = {
  includeAutomaticAdjustments?: boolean;
  markAutomaticAdjustments?: boolean;
};

type LimitValue = {
  value: number;
  source: 'base' | 'automatic' | 'override';
};

function effectiveTimeLimit(
  problem: Problem,
  language: JudgeLanguage,
): LimitValue {
  const override = problem.language_resource_limits?.[language]?.time_limit_ms;
  if (override) return { value: override, source: 'override' };
  const adjustment = problem.language_resource_limits?.[language]
    ?.disable_auto_adjustment
    ? undefined
    : LANGUAGE_TIME_ADJUSTMENTS[language];
  if (!adjustment) return { value: problem.time_limit_ms, source: 'base' };
  return {
    value: problem.time_limit_ms * adjustment.multiplier + adjustment.bonusMs,
    source: 'automatic',
  };
}

function effectiveMemoryLimit(
  problem: Problem,
  language: JudgeLanguage,
): LimitValue {
  const override =
    problem.language_resource_limits?.[language]?.memory_limit_mb;
  if (override) return { value: override, source: 'override' };
  const adjustment = problem.language_resource_limits?.[language]
    ?.disable_auto_adjustment
    ? undefined
    : LANGUAGE_MEMORY_ADJUSTMENTS[language];
  if (!adjustment) return { value: problem.memory_limit_mb, source: 'base' };
  return {
    value: problem.memory_limit_mb * adjustment.multiplier + adjustment.bonusMb,
    source: 'automatic',
  };
}

function limitSummary(
  problem: Problem,
  kind: 'memory_limit_mb' | 'time_limit_ms',
  formatter: (value: number) => string,
  options: LimitLabelOptions = {},
) {
  return LANGUAGE_ORDER.flatMap((language) => {
    const limit =
      kind === 'time_limit_ms'
        ? effectiveTimeLimit(problem, language)
        : effectiveMemoryLimit(problem, language);
    const base =
      kind === 'time_limit_ms'
        ? problem.time_limit_ms
        : problem.memory_limit_mb;
    if (limit.value === base) return [];
    if (limit.source === 'automatic' && !options.includeAutomaticAdjustments) {
      return [];
    }
    const sourceLabel =
      limit.source === 'automatic' && options.markAutomaticAdjustments
        ? ' 자동 보정'
        : '';
    return `${judgeLanguageLabel(language)} : ${formatter(limit.value)}${sourceLabel}`;
  }).join(', ');
}

export function problemTimeLimitLabel(
  problem: Problem,
  options: LimitLabelOptions = {},
) {
  const overrides = limitSummary(problem, 'time_limit_ms', formatTime, options);
  return overrides
    ? `${formatTime(problem.time_limit_ms)} ( ${overrides} )`
    : formatTime(problem.time_limit_ms);
}

export function problemMemoryLimitLabel(
  problem: Problem,
  options: LimitLabelOptions = {},
) {
  const overrides = limitSummary(
    problem,
    'memory_limit_mb',
    formatMemory,
    options,
  );
  return overrides
    ? `${formatMemory(problem.memory_limit_mb)} ( ${overrides} )`
    : formatMemory(problem.memory_limit_mb);
}
