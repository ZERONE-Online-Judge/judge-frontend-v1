import type { Contest } from '@/domains/contestAdministration/types';
import type { contestAccessPhase } from '@/domains/contestAdministration/logic';
import { countdownParts } from '@/domains/contestAdministration/operatorStatus';

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  timeZone: 'Asia/Seoul',
});
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Seoul',
});

export default function ContestPublicSchedule({
  contest,
  phase,
  now,
}: {
  contest: Contest;
  phase: ReturnType<typeof contestAccessPhase>;
  now: number;
}) {
  const scheduleTbd = phase === 'schedule_tbd';
  const target = Date.parse(
    phase === 'before' ? contest.start_at : contest.end_at,
  );
  const remaining = target - now;
  const showCountdown =
    (phase === 'before' || phase === 'running') &&
    now > 0 &&
    Number.isFinite(remaining) &&
    remaining > 0;
  const label = phase === 'before' ? '대회 시작까지' : '대회 종료까지';
  const parts = showCountdown ? countdownParts(remaining) : null;
  return (
    <div className="contest-public-schedule" data-phase={phase}>
      <header className="contest-public-schedule-heading">
        <h2>대회 일정</h2>
        <span>한국 시간 (KST)</span>
      </header>
      <div className="contest-public-schedule-main">
        <div className="contest-public-schedule-summary">
          {parts ? (
            <>
              <p>{label}</p>
              <div
                className="contest-public-countdown"
                role="timer"
                aria-label={label}
                aria-live="off"
              >
                {parts.days > 0 ? (
                  <span>
                    <strong>{parts.days}</strong>
                    <small>일</small>
                  </span>
                ) : null}
                <span>
                  <strong>{parts.hours}</strong>
                  <small>시간</small>
                </span>
                <b aria-hidden="true">:</b>
                <span>
                  <strong>{parts.minutes}</strong>
                  <small>분</small>
                </span>
                <b aria-hidden="true">:</b>
                <span>
                  <strong>{parts.seconds}</strong>
                  <small>초</small>
                </span>
              </div>
            </>
          ) : (
            <>
              <p>
                {phase === 'ended'
                  ? '모든 일정이 마무리되었습니다'
                  : '대회 일정 안내'}
              </p>
              <strong className="contest-public-schedule-message">
                {phase === 'ended'
                  ? '대회 종료'
                  : scheduleTbd
                    ? '일정 준비 중'
                    : now
                      ? '일정 확인 필요'
                      : '시간 확인 중'}
              </strong>
            </>
          )}
        </div>
        <dl className="contest-public-schedule-timeline">
          <ScheduleMoment
            label="시작"
            value={contest.start_at}
            scheduleTbd={scheduleTbd}
          />
          <ScheduleMoment
            label="종료"
            value={contest.end_at}
            scheduleTbd={scheduleTbd}
          />
        </dl>
      </div>
    </div>
  );
}

function ScheduleMoment({
  label,
  value,
  scheduleTbd,
}: {
  label: string;
  value: string;
  scheduleTbd: boolean;
}) {
  const date = new Date(value);
  const valid =
    !scheduleTbd && Boolean(value) && Number.isFinite(date.getTime());
  return (
    <div className="contest-public-schedule-moment">
      <dt>{label}</dt>
      <dd>
        {valid ? (
          <time dateTime={value}>
            <span>{dateFormat.format(date)}</span>
            <strong>{timeFormat.format(date)}</strong>
          </time>
        ) : (
          <span className="contest-public-schedule-unknown">일정 미정</span>
        )}
      </dd>
    </div>
  );
}
