import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { Contest } from '@/domains/contestAdministration/types';
import {
  countdownParts,
  formatOperatorMoment,
  operatorContestStatus,
} from '@/domains/contestAdministration/operatorStatus';
import { useClockTick } from '@/shared/hooks/useAutoRefresh';
import './ContestProgressStatus.css';

export default function ContestProgressStatus({
  contest,
  audience = 'participant',
  canManageSettings = false,
  stale = false,
}: {
  contest: Contest;
  audience?: 'participant' | 'operator';
  canManageSettings?: boolean;
  stale?: boolean;
}) {
  const now = useClockTick();
  const titleId = useId();
  if (!now)
    return (
      <div className="zoj-card" role="status">
        대회 진행 상태를 확인하고 있습니다.
      </div>
    );
  const status = operatorContestStatus(contest, now);
  const isOperator = audience === 'operator';
  const description = isOperator
    ? status.description
    : {
        draft: '대회 일정이 아직 확정되지 않았습니다.',
        before: '시작 시각이 되면 코드를 제출할 수 있습니다.',
        running: '대회 종료 전까지 코드를 제출할 수 있습니다.',
        ended: '대회가 종료되어 제출이 마감되었습니다.',
        unknown: '대회 일정을 확인할 수 없습니다.',
      }[status.phase];
  const countdownLabel =
    status.phase === 'before' ? '대회 시작까지' : '대회 종료까지';
  const freezeCountdown =
    status.freezeRemaining === null
      ? null
      : countdownParts(status.freezeRemaining);

  return (
    <section
      className="zoj-card contest-progress-status"
      data-phase={status.phase}
      aria-labelledby={titleId}
    >
      <div className="contest-progress-status__top">
        <p>대회 진행 현황</p>
        {isOperator && canManageSettings ? (
          <Link to={`/operator/contests/${contest.contest_id}/settings`}>
            대회 설정{' '}
            <span aria-hidden="true">
              <InterfaceIcon name="arrowUpRight" />
            </span>
          </Link>
        ) : null}
      </div>
      <div className="contest-progress-status__main">
        <div className="contest-progress-status__summary">
          <h2 id={titleId} aria-live="polite">
            <span className="contest-progress-status__dot" aria-hidden="true" />
            {status.title}
          </h2>
          <p>{description}</p>
          <div className="contest-progress-status__badges">
            <span className="contest-progress-status__submission">
              {status.submissionLabel}
            </span>
            {isOperator ? <span>{status.visibility}</span> : null}
          </div>
        </div>
        <div className="zoj-inset contest-progress-status__countdown">
          {status.remaining !== null ? (
            <>
              <p>{countdownLabel}</p>
              <Countdown remaining={status.remaining} label={countdownLabel} />
            </>
          ) : (
            <>
              <p>참가자 제출</p>
              <strong className="contest-progress-status__message">
                {status.phase === 'ended'
                  ? '마감되었습니다'
                  : status.phase === 'draft'
                    ? '아직 시작하지 않았어요'
                    : '일정을 확인해 주세요'}
              </strong>
            </>
          )}
        </div>
      </div>

      {status.showSchedule ? (
        <>
          <div className="contest-progress-status__progress">
            <div>
              <span>대회 진행률</span>
              <strong>{Math.floor(status.progress)}%</strong>
            </div>
            <progress
              aria-label="대회 진행률"
              max={100}
              value={status.progress}
            />
          </div>
          <dl className="contest-progress-status__schedule">
            <ScheduleMoment label="시작" value={contest.start_at} />
            <ScheduleMoment label="프리즈" value={contest.freeze_at} />
            <ScheduleMoment label="종료" value={contest.end_at} />
          </dl>
          <div
            className="contest-progress-status__scoreboard"
            data-frozen={status.freezeActive}
          >
            <div>
              <strong>{status.scoreboard.label}</strong>
              {freezeCountdown ? (
                <span role="timer" aria-live="off">
                  프리즈까지{' '}
                  {freezeCountdown.days ? `${freezeCountdown.days}일 ` : ''}
                  {freezeCountdown.hours}:{freezeCountdown.minutes}:
                  {freezeCountdown.seconds}
                </span>
              ) : null}
            </div>
            <p>{status.scoreboard.detail}</p>
          </div>
        </>
      ) : null}
      <p
        className="contest-progress-status__note"
        role={stale ? 'status' : undefined}
      >
        {stale
          ? '일정을 갱신하지 못해 마지막으로 확인한 일정으로 표시하고 있습니다.'
          : isOperator
            ? '한국 시간(KST) 기준 · 남은 시간은 매초, 일정 변경은 15초마다 갱신됩니다.'
            : '한국 시간(KST) 기준'}
      </p>
    </section>
  );
}

function Countdown({ remaining, label }: { remaining: number; label: string }) {
  const parts = countdownParts(remaining);
  return (
    <div
      className="contest-progress-status__timer"
      role="timer"
      aria-label={label}
      aria-live="off"
    >
      {parts.days > 0 ? (
        <span className="contest-progress-status__days">
          {parts.days}
          <small>일</small>
        </span>
      ) : null}
      <span>
        {parts.hours}
        <small>시간</small>
      </span>
      <b aria-hidden="true">:</b>
      <span>
        {parts.minutes}
        <small>분</small>
      </span>
      <b aria-hidden="true">:</b>
      <span>
        {parts.seconds}
        <small>초</small>
      </span>
    </div>
  );
}

function ScheduleMoment({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <time dateTime={value}>{formatOperatorMoment(value)}</time>
      </dd>
    </div>
  );
}
