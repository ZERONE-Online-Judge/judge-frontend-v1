import type { Problem } from '@/domains/problemManagement/types';
import {
  problemMemoryLimitLabel,
  problemTimeLimitLabel,
} from '@/domains/problemManagement/resourceLimits';

type ProblemMetaPillsProps = {
  problem: Problem;
};

export default function ProblemMetaPills({ problem }: ProblemMetaPillsProps) {
  return (
    <dl className="flex flex-wrap gap-2">
      {problem.scoring_mode === 'ioi' ? (
        <div className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700">
          <dt className="inline">배점 </dt>
          <dd className="inline">100점</dd>
        </div>
      ) : null}
      <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
        <dt className="inline">시간 </dt>
        <dd className="inline">{problemTimeLimitLabel(problem)}</dd>
      </div>
      <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
        <dt className="inline">메모리 </dt>
        <dd className="inline">{problemMemoryLimitLabel(problem)}</dd>
      </div>
    </dl>
  );
}
