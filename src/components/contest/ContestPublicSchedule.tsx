import type { Contest } from '@/domains/contestAdministration/types';
import type { contestAccessPhase } from '@/domains/contestAdministration/logic';
import ContestScheduleClock from '@/components/contest/ContestScheduleClock';

export default function ContestPublicSchedule({
  contest,
  phase,
  now,
}: {
  contest: Contest;
  phase: ReturnType<typeof contestAccessPhase>;
  now: number;
}) {
  return (
    <div className="contest-public-schedule" data-phase={phase}>
      <header className="contest-public-schedule-heading">
        <h2>대회 일정</h2>
        <span>한국 시간 (KST)</span>
      </header>
      <ContestScheduleClock contest={contest} now={now} />
    </div>
  );
}
