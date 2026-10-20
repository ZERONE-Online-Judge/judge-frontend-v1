import { Link } from 'react-router-dom';
import { problemDetailNavText, sharedUiText } from '@/data/uiText';

type ProblemNavigationPillsProps = {
  contestId: string;
  problemId: string;
  active: 'combined' | 'problem' | 'submit' | 'editorial';
  allowEditorial?: boolean;
  allowSubmit?: boolean;
  search?: string;
};

export default function ProblemNavigationPills({
  contestId,
  problemId,
  active,
  allowEditorial = false,
  allowSubmit = true,
  search = '',
}: ProblemNavigationPillsProps) {
  const suffix = search && search !== '?' ? search : '';

  return (
    <nav
      aria-label={sharedUiText.problemDetailMenuAriaLabel}
      className="zoj-problem-view-tabs min-w-0 overflow-x-auto pb-1"
    >
      <ul className="flex min-w-max items-center gap-2 sm:gap-3">
        {problemDetailNavText
          .filter((tab) => {
            if (
              !allowSubmit &&
              (tab.key === 'submit' || tab.key === 'combined')
            )
              return false;
            if (!allowEditorial && tab.key === 'editorial') return false;
            return true;
          })
          .map((tab) => {
            const to = tab.path
              ? `/contests/${contestId}/problems/${problemId}/${tab.path}${suffix}`
              : `/contests/${contestId}/problems/${problemId}${suffix}`;
            const isActive = tab.key === active;

            return (
              <li key={tab.key}>
                <Link
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium whitespace-nowrap transition',
                    isActive
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200',
                  ].join(' ')}
                  to={to}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
