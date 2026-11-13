import { useId } from 'react';
import {
  DEFAULT_PRESENTATION_ALERT_MINUTES,
  parsePresentationAlertMinutes,
} from '@/domains/submissionScoreboard/presentationAlertMinutes';

export default function PresentationAlertSettings({
  freezeMinutes,
  endMinutes,
  onChange,
}: {
  freezeMinutes: string;
  endMinutes: string;
  onChange: (kind: 'freeze' | 'end', value: string) => void;
}) {
  return (
    <>
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <AlertMinutesInput
          label="프리즈 알림"
          event="프리즈"
          value={freezeMinutes}
          onChange={(value) => onChange('freeze', value)}
        />
        <AlertMinutesInput
          label="종료 알림"
          event="종료"
          value={endMinutes}
          onChange={(value) => onChange('end', value)}
        />
      </div>
      <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
        <strong className="mr-2 font-semibold text-slate-700">
          카운트다운 · 고정
        </strong>
        시작 10초 전 · 프리즈 3초 전 · 종료 60초 전
        <span className="block text-slate-500">
          알림을 꺼도 카운트다운은 표시되며, 시간이 겹치면 카운트다운이 먼저
          나옵니다.
        </span>
      </p>
    </>
  );
}

function AlertMinutesInput({
  label,
  event,
  value,
  onChange,
}: {
  label: string;
  event: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const parsed = parsePresentationAlertMinutes(value);
  const isDefault =
    !parsed.error &&
    JSON.stringify(parsed.minutes) ===
      JSON.stringify(DEFAULT_PRESENTATION_ALERT_MINUTES);

  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-slate-700">
          {label} <span className="font-normal text-slate-500">(분 전)</span>
        </label>
        <button
          type="button"
          className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:text-slate-400 disabled:hover:bg-transparent"
          aria-label={`${label} 기본값 복원`}
          disabled={isDefault}
          onClick={() =>
            onChange(DEFAULT_PRESENTATION_ALERT_MINUTES.join(', '))
          }
        >
          기본값 복원
        </button>
      </div>
      <input
        id={id}
        type="text"
        autoComplete="off"
        className="h-11 min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400 aria-invalid:border-rose-400 aria-invalid:focus:ring-rose-100"
        placeholder="예: 30, 20, 10, 5"
        aria-describedby={`${id}-hint`}
        aria-invalid={Boolean(parsed.error)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!parsed.error) {
            const formatted = parsed.minutes.join(', ');
            if (formatted !== value) onChange(formatted);
          }
        }}
      />
      <p
        id={`${id}-hint`}
        className={`text-xs leading-5 ${parsed.error ? 'text-rose-700' : 'text-slate-500'}`}
        role={parsed.error ? 'alert' : undefined}
      >
        {parsed.error ||
          (parsed.minutes.length
            ? parsed.minutes.length > 4
              ? `${event} 알림 ${parsed.minutes.length}개 · ${parsed.minutes.slice(0, 4).join('·')}분 전 등`
              : `${event} ${parsed.minutes.join('·')}분 전에 안내합니다.`
            : `${event} 분 단위 알림이 꺼집니다.`)}
      </p>
    </div>
  );
}
