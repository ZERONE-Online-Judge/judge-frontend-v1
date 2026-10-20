import { Link } from 'react-router-dom';
import './ProblemNavigation.css';
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
      className="zoj-problem-view-tabs"
    >
      <ul>
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
                  className="zoj-problem-view-tab"
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
