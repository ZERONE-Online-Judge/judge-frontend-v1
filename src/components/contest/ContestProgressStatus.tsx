import { Link } from 'react-router-dom';
import type { Contest } from '@/domains/contestAdministration/types';
import { operatorContestStatus } from '@/domains/contestAdministration/operatorStatus';
import { useClockTick } from '@/shared/hooks/useAutoRefresh';
import ContestScheduleClock from '@/components/contest/ContestScheduleClock';
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
  const now = useClockTick(250);
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
  return (
    <section
      className="zoj-card contest-progress-status"
      data-phase={status.phase}
      aria-label="대회 진행 현황"
    >
      <header className="contest-progress-status__top">
        <p>대회 진행 현황</p>
        <span>{now ? status.title : '시간 확인 중'}</span>
      </header>
      <ContestScheduleClock contest={contest} now={now} />
      <div className="contest-progress-status__footer">
        <span>한국 시간(KST) 기준</span>
        <p>{description}</p>
      </div>
      {isOperator ? (
        <div className="contest-progress-status__operator">
          <span>
            {status.submissionLabel} · {status.visibility}
          </span>
          {canManageSettings ? (
            <Link to={`/operator/contests/${contest.contest_id}/settings`}>
              대회 설정 ↗
            </Link>
          ) : null}
          <p>
            {status.scoreboard.label} · {status.scoreboard.detail}
          </p>
        </div>
      ) : null}
      {stale ? (
        <p className="contest-progress-status__note" role="status">
          일정을 갱신하지 못해 마지막으로 확인한 일정으로 표시하고 있습니다.
        </p>
      ) : null}
    </section>
  );
}
