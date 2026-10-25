import { memo, useState, type CSSProperties } from 'react';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import {
  countdownParts,
  formatOperatorMoment,
} from '@/domains/contestAdministration/operatorStatus';
import {
  contestTimerState,
  type ContestTiming,
  type ContestTimerState,
} from '@/domains/contestAdministration/contestTimer';
import './ContestScheduleClock.css';

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

const RollingNumber = memo(function RollingNumber({
  value,
}: {
  value: string;
}) {
  const [frame, setFrame] = useState({
    value,
    previous: null as string | null,
  });
  if (frame.value !== value) setFrame({ value, previous: frame.value });
  return (
    <strong
      className="contest-clock-digit"
      style={{ minWidth: `${Math.max(2, value.length) * 0.63}em` }}
    >
      {frame.previous !== null ? (
        <span
          className="contest-clock-digit-old"
          key={`old-${frame.previous}`}
          aria-hidden="true"
          onAnimationEnd={() =>
            setFrame((current) => ({ ...current, previous: null }))
          }
        >
          {frame.previous}
        </span>
      ) : null}
      <span className="contest-clock-digit-new" key={value}>
        {value}
      </span>
    </strong>
  );
});

export function ContestCountdown({ state }: { state: ContestTimerState }) {
  if (state.view === 'started' || state.view === 'ended')
    return (
      <div
        className="contest-clock-message"
        role="status"
        aria-live="polite"
        data-view={state.view}
      >
        <InterfaceIcon name="check" size={30} />
        <strong>
          {state.view === 'started'
            ? '대회가 시작되었습니다'
            : '대회가 종료되었습니다'}
        </strong>
      </div>
    );
  if (state.view === 'unavailable')
    return (
      <div className="contest-clock-message">
        <p>대회 일정 안내</p>
        <strong>
          {state.phase === 'draft'
            ? '일정 미정'
            : state.valid
              ? '시간 확인 중'
              : '일정 확인 필요'}
        </strong>
      </div>
    );
  const starting = state.phase === 'before';
  const label = starting ? '대회 시작까지' : '대회 종료까지';
  const seconds = Math.max(1, Math.ceil((state.remaining ?? 0) / 1000));
  if (state.view === 'startCountdown' || state.view === 'endCountdown')
    return (
      <div
        className="contest-clock-focus"
        role="timer"
        aria-live="off"
        aria-label={`${label} ${seconds}초`}
      >
        <p>{label}</p>
        <strong key={seconds}>{seconds}</strong>
        <span>{starting ? '초 뒤에 시작합니다' : '초 뒤에 종료됩니다'}</span>
      </div>
    );
  const parts = countdownParts(state.remaining ?? 0);
  return (
    <div className="contest-clock-rolling">
      <p>{label}</p>
      <div
        className="contest-clock-timer"
        role="timer"
        aria-live="off"
        aria-label={label}
      >
        {parts.days > 0 ? (
          <span className="contest-clock-days">
            <RollingNumber value={String(parts.days)} />
            <small>일</small>
          </span>
        ) : null}
        <span>
          <RollingNumber value={parts.hours} />
          <small>시간</small>
        </span>
        <b aria-hidden="true">:</b>
        <span>
          <RollingNumber value={parts.minutes} />
          <small>분</small>
        </span>
        <b aria-hidden="true">:</b>
        <span>
          <RollingNumber value={parts.seconds} />
          <small>초</small>
        </span>
      </div>
      {state.freezeRemaining !== null ? (
        <div className="contest-clock-freeze">
          <span>프리즈까지</span>
          <FreezeCountdown remaining={state.freezeRemaining} />
        </div>
      ) : state.freezeActive ? (
        <p className="contest-clock-freeze">스코어보드 프리즈 적용 중</p>
      ) : null}
    </div>
  );
}
function FreezeCountdown({ remaining }: { remaining: number }) {
  const parts = countdownParts(remaining);
  return (
    <span role="timer" aria-live="off" aria-label="프리즈까지">
      {parts.days > 0 ? `${parts.days}일 ` : ''}
      {parts.hours}:{parts.minutes}:{parts.seconds}
    </span>
  );
}

export default function ContestScheduleClock({
  contest,
  now,
}: {
  contest: ContestTiming;
  now: number;
}) {
  const state = contestTimerState(contest, now);
  const focus = ['startCountdown', 'started', 'endCountdown'].includes(
    state.view,
  );
  const timelineStyle = {
    '--clock-start': `${state.anchors.start}px`,
    '--clock-freeze': `${state.anchors.freeze}px`,
    '--clock-end': `${state.anchors.end}px`,
    '--clock-current': `${state.current}px`,
  } as CSSProperties;
  const showTimeline =
    state.valid && !['draft', 'unknown'].includes(state.phase) && !focus;
  return (
    <div
      className="contest-schedule-clock"
      data-view={state.view}
      data-phase={state.phase}
    >
      <div className="contest-clock-summary">
        <ContestCountdown state={state} />
      </div>
      {showTimeline ? (
        <div
          className="contest-clock-timeline"
          style={timelineStyle}
          data-live={state.phase === 'running'}
          data-has-freeze={state.hasFreeze}
        >
          <p className="contest-clock-current">
            {state.phase === 'running' ? (
              <>
                현재 {timeFormat.format(now)} · {Math.floor(state.progress)}%
              </>
            ) : state.phase === 'before' ? (
              '시작을 기다리고 있습니다'
            ) : (
              '전체 일정 종료'
            )}
          </p>
          <div className="contest-clock-rail" aria-hidden="true">
            <span />
          </div>
          <dl aria-label="대회 일정">
            <ScheduleMoment
              label="시작"
              value={contest.start_at}
              kind="start"
              compact={state.hasFreeze && state.afterFreeze}
            />
            {state.hasFreeze ? (
              <ScheduleMoment
                label={
                  contest.scoreboard_freeze_mode === 'frozen'
                    ? '프리즈 기준'
                    : '프리즈'
                }
                value={contest.freeze_at!}
                kind="freeze"
              />
            ) : null}
            <ScheduleMoment
              label="종료"
              value={contest.end_at}
              kind="end"
              compact={
                state.phase !== 'before' &&
                state.hasFreeze &&
                !state.afterFreeze
              }
            />
          </dl>
          {state.phase === 'running' ? (
            <div
              className="contest-clock-position"
              role="progressbar"
              aria-label="대회 진행률"
              aria-valuenow={Math.floor(state.progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`대회 진행률 ${Math.floor(state.progress)}%, 현재 ${timeFormat.format(now)}`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
function ScheduleMoment({
  label,
  value,
  kind,
  compact = false,
}: {
  label: string;
  value: string;
  kind: string;
  compact?: boolean;
}) {
  return (
    <div
      className="contest-clock-moment"
      data-kind={kind}
      data-compact={compact}
    >
      <dt>{label}</dt>
      <dd>
        <time dateTime={value} aria-label={formatOperatorMoment(value)}>
          <strong>{timeFormat.format(new Date(value))}</strong>
          <span>{dateFormat.format(new Date(value))}</span>
        </time>
      </dd>
    </div>
  );
}
