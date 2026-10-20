import type { Ref } from 'react';
import { Link } from 'react-router-dom';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import type { Division } from '@/domains/contestAdministration/types';
import type { Problem } from '@/domains/problemManagement/types';
import './ProblemNavigation.css';

type ProblemSidebarProps = {
  open: boolean;
  panelId: string;
  onClose: () => void;
  contestId: string;
  problems: Problem[];
  activeProblemId: string;
  divisions?: Division[];
  selectedDivisionId?: string;
  onDivisionChange?: (divisionId: string) => void;
  targetView?: 'combined' | 'problem' | 'submit' | 'editorial';
  search?: string;
};

export default function ProblemSidebar({
  open,
  panelId,
  onClose,
  contestId,
  problems,
  activeProblemId,
  divisions = [],
  selectedDivisionId = '',
  onDivisionChange,
  targetView = 'combined',
  search = '',
}: ProblemSidebarProps) {
  const showDivisionSelect = divisions.length > 1 && onDivisionChange;

  return (
    <aside
      className="zoj-problem-drawer"
      id={panelId}
      data-open={open}
      aria-hidden={!open}
      inert={!open}
      aria-label="빠른 문제 전환"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="zoj-problem-drawer__inner">
        <header>
          <h2>
            문제 목록 <span>{problems.length}</span>
          </h2>
          <button type="button" aria-label="문제 목록 닫기" onClick={onClose}>
            <InterfaceIcon name="close" size={20} />
          </button>
        </header>
        {showDivisionSelect ? (
          <label className="zoj-problem-drawer__division">
            <span>유형</span>
            <select
              onChange={(event) => onDivisionChange(event.target.value)}
              value={selectedDivisionId}
            >
              {divisions.map((division) => (
                <option key={division.division_id} value={division.division_id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <nav aria-label="문제 목록">
          <ul>
            {problems.map((problem) => {
              const active = problem.problem_id === activeProblemId;
              const query = new URLSearchParams(search);
              if (!active) query.delete('submissionId');
              const suffix = query.size ? `?${query}` : '';
              const viewPath =
                targetView === 'combined'
                  ? ''
                  : targetView === 'problem'
                    ? '/statement'
                    : `/${targetView}`;
              return (
                <li key={problem.problem_id}>
                  <Link
                    aria-current={active ? 'page' : undefined}
                    title={problem.title}
                    onClick={onClose}
                    to={`/contests/${contestId}/problems/${problem.problem_id}${viewPath}${suffix}`}
                  >
                    <span className="zoj-problem-drawer__code">
                      {problem.problem_code}
                    </span>
                    <span className="zoj-problem-drawer__title">
                      {problem.title}
                    </span>
                    {active ? <InterfaceIcon name="check" size={16} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}

export function ProblemMenuButton({
  open,
  disabled,
  panelId,
  onToggle,
  buttonRef,
}: {
  open: boolean;
  disabled?: boolean;
  panelId: string;
  onToggle: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      className="zoj-problem-menu-trigger"
      type="button"
      ref={buttonRef}
      aria-label="문제 목록 열기"
      aria-controls={panelId}
      aria-expanded={open}
      disabled={disabled}
      onClick={onToggle}
    >
      <InterfaceIcon name="menu" size={18} />
      <span>문제 목록</span>
    </button>
  );
}
