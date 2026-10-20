import { useContestParticipantSession } from '@/domains/contestRuntime/useContestParticipantSession';
import { NavLink } from 'react-router-dom';
import { contestCompactNavText, sharedUiText } from '@/data/uiText';
import {
  canViewContestResource,
  contestAccessPhase,
  contestResourceAccess,
} from '@/domains/contestAdministration/logic';
import type { Contest } from '@/domains/contestAdministration/types';

type ContestPageNavigationProps = {
  contest?: Contest;
  contestId: string;
};

export default function ContestPageNavigation({
  contest,
  contestId,
}: ContestPageNavigationProps) {
  const { isPreview, participantContest, activeParticipantSession } =
    useContestParticipantSession(contestId);
  const hasSessionAccess = Boolean(
    participantContest || activeParticipantSession,
  );
  const phase = contest ? contestAccessPhase(contest) : undefined;
  const tabs = contestCompactNavText.filter((tab) => {
    if (!tab.path || isPreview || !contest) return true;
    if (phase === 'before' || phase === 'schedule_tbd') return hasSessionAccess;
    const canView = (resource: Parameters<typeof contestResourceAccess>[1]) =>
      canViewContestResource(
        contest,
        hasSessionAccess,
        contestResourceAccess(contest, resource),
      );
    if (tab.path === 'board') return canView('notice') || canView('board');
    const resources = {
      problems: 'problem',
      submissions: 'submission',
      scoreboard: 'scoreboard',
    } as const;
    return canView(resources[tab.path]);
  });
  const isBeforeStart =
    !isPreview && contest ? contestAccessPhase(contest) === 'before' : false;

  return (
    <nav
      aria-label={sharedUiText.contestMenuAriaLabel}
      className="zoj-contest-tabs"
    >
      <ul>
        {tabs.map((tab) => {
          const to = tab.path
            ? `/contests/${contestId}/${tab.path}`
            : `/contests/${contestId}`;
          const disabled =
            isBeforeStart && tab.path !== '' && tab.path !== 'board';

          return (
            <li key={tab.path || 'overview'}>
              {disabled ? (
                <button
                  className="zoj-contest-tab"
                  disabled
                  title="대회 시작 전에는 문제집, 채점현황, 스코어보드를 볼 수 없습니다."
                  type="button"
                >
                  {tab.label}
                </button>
              ) : (
                <NavLink className="zoj-contest-tab" end={!tab.path} to={to}>
                  {tab.label}
                </NavLink>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
