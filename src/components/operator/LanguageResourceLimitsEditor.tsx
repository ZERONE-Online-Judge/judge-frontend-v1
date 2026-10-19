import type { JudgeLanguage } from '@/domains/submissionScoreboard/types';
export type LanguageLimitDraft = {
  timeLimitMs: string;
  memoryLimitMb: string;
  disableAutoAdjustment?: boolean;
};
export default function LanguageResourceLimitsEditor({
  rows,
  values,
  baseTime,
  baseMemory,
  onChange,
  onNormalize,
}: {
  rows: {
    language: JudgeLanguage;
    label: string;
    corrected: boolean;
    hint: string;
  }[];
  values: Partial<Record<JudgeLanguage, LanguageLimitDraft>>;
  baseTime: string;
  baseMemory: string;
  onChange: (language: JudgeLanguage, value: LanguageLimitDraft) => void;
  onNormalize: () => void;
}) {
  return (
    <section
      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
      aria-label="언어별 리소스 제한"
    >
      <h3 className="text-sm font-semibold text-slate-900">
        언어별 리소스 제한
      </h3>
      <p className="mt-1 text-xs font-medium text-slate-500">
        비워두면 언어별 자동 보정을 적용합니다. 직접 지정한 값은 그대로
        사용하고, 자동 보정을 끄면 빈 항목에 문제 기본 제한을 적용합니다.
      </p>
      <div className="mt-4 grid gap-3">
        {rows.map(({ language, label, corrected, hint }) => {
          const limit = values[language] ?? {
            timeLimitMs: '',
            memoryLimitMb: '',
          };
          return (
            <div
              className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] md:items-end"
              key={language}
            >
              <div>
                <p className="text-sm font-semibold text-slate-950">{label}</p>
                {corrected && (
                  <label className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      aria-label={`${label} 자동 보정 끄기`}
                      checked={Boolean(limit.disableAutoAdjustment)}
                      onChange={(event) =>
                        onChange(language, {
                          ...limit,
                          disableAutoAdjustment: event.target.checked,
                        })
                      }
                    />
                    자동 보정 끄기
                  </label>
                )}
              </div>
              <label className="grid gap-2 text-xs font-semibold text-slate-600">
                시간(ms)
                <input
                  aria-label={`${label} 시간 제한 (ms)`}
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 outline-none focus:border-indigo-400"
                  inputMode="numeric"
                  value={limit.timeLimitMs}
                  placeholder={
                    corrected && !limit.disableAutoAdjustment
                      ? '자동 보정'
                      : baseTime
                  }
                  onBlur={onNormalize}
                  onChange={(event) =>
                    onChange(language, {
                      ...limit,
                      timeLimitMs: event.target.value,
                    })
                  }
                />
              </label>
              <label className="grid gap-2 text-xs font-semibold text-slate-600">
                메모리(MB)
                <input
                  aria-label={`${label} 메모리 제한 (MB)`}
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 outline-none focus:border-indigo-400"
                  inputMode="numeric"
                  value={limit.memoryLimitMb}
                  placeholder={
                    corrected && !limit.disableAutoAdjustment
                      ? '자동 보정'
                      : baseMemory
                  }
                  onBlur={onNormalize}
                  onChange={(event) =>
                    onChange(language, {
                      ...limit,
                      memoryLimitMb: event.target.value,
                    })
                  }
                />
              </label>
              {hint && (
                <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs leading-relaxed font-medium text-indigo-800 md:col-span-3">
                  {hint}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
