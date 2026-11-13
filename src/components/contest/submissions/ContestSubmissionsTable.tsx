import { judgeLanguageLabel } from '@/domains/submissionScoreboard/languageLabel';
import { Fragment, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Submission } from '@/domains/submissionScoreboard/types';
import type { Problem } from '@/domains/problemManagement/types';
import { contestStaffDisplayName } from '@/domains/identityAccess/staffDisplay';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/dateTime';
import { useClockTick } from '@/shared/hooks/useAutoRefresh';
import { submissionRecencyStrength } from '@/domains/submissionScoreboard/submissionTime';
import { formatMemoryKb } from '@/shared/lib/formatters';
import ContestSubmissionResultBadge from '@/components/contest/submissions/ContestSubmissionResultBadge';
import { SvgIcon } from '@/utils/Icons';
import './SubmissionRecency.css';

type ContestSubmissionsTableProps = {
  contestId: string;
  /** Render sample submissions without navigation to a real contest. */
  preview?: boolean;
  fallbackMemberName?: string;
  fallbackTeamName?: string;
  problems?: Problem[];
  submissions: Submission[];
  loadSource?: (submissionId: string) => Promise<string>;
  sourceScopeKey?: string;
};

function formatTimeMs(value?: number | null) {
  if (value === undefined || value === null) return '-';
  return `${value.toLocaleString('ko-KR')} ms`;
}

function formatCodeLength(submission: Submission) {
  const length =
    submission.code_length_bytes ??
    submission.source_code_length ??
    submission.source_code?.length ??
    null;
  if (length === null) return '-';

  return `${length.toLocaleString('ko-KR')} B`;
}

function displaySubmissionId(submissionId: string) {
  return submissionId.split('-')[0] || submissionId;
}

function isOperatorTestSubmission(submission: Submission) {
  if (submission.submission_kind === 'operator_test') return true;
  return (
    submission.team_name?.startsWith('__operator_test__:') ||
    submission.team?.team_name?.startsWith('__operator_test__:') ||
    submission.participant_team_id?.startsWith('__operator_test__:')
  );
}

function submissionMemory(submission: Submission) {
  return (
    submission.memory_kb ??
    submission.memory_usage_kb ??
    submission.max_memory_kb ??
    null
  );
}

function submissionTime(submission: Submission) {
  return (
    submission.time_ms ??
    submission.execution_time_ms ??
    submission.runtime_ms ??
    null
  );
}

function submissionName(
  submission: Submission,
  fallbackTeamName?: string,
  fallbackMemberName?: string,
) {
  if (submission.submission_kind === 'mock_judging') return '모의채점';
  if (isOperatorTestSubmission(submission)) {
    return contestStaffDisplayName(
      submission.submitted_by_name,
      submission.submitted_by_title,
    );
  }

  return (
    submission.team_name ??
    submission.team?.team_name ??
    submission.member_name ??
    submission.member?.name ??
    fallbackTeamName ??
    fallbackMemberName ??
    '-'
  );
}

function submissionProblem(
  submission: Submission,
  problemById: Map<string, Problem>,
) {
  const problem = submission.problem ?? problemById.get(submission.problem_id);
  return (
    problem?.problem_code ?? submission.problem_code ?? submission.problem_id
  );
}

function submissionProblemTitle(
  submission: Submission,
  problemById: Map<string, Problem>,
) {
  const problem = submission.problem ?? problemById.get(submission.problem_id);
  if (!problem) return submission.problem_title ?? submission.problem_id;

  return `${problem.problem_code}. ${problem.title}`;
}

function submissionProblemId(
  submission: Submission,
  problemById: Map<string, Problem>,
) {
  return (
    submission.problem?.problem_id ??
    problemById.get(submission.problem_id)?.problem_id ??
    submission.problem_id
  );
}

function submissionSourceCode(submission: Submission) {
  return submission.source_code ?? '';
}

export default function ContestSubmissionsTable({
  contestId,
  preview = false,
  fallbackMemberName,
  fallbackTeamName,
  problems = [],
  submissions,
  loadSource,
  sourceScopeKey,
}: ContestSubmissionsTableProps) {
  const now = useClockTick() || undefined;
  const problemById = new Map(
    problems.map((problem) => [problem.problem_id, problem]),
  );
  const cellClassName = 'px-4 py-4 align-top font-normal text-slate-700';
  const headerCellClassName = 'px-4 py-3 font-medium';
  const [openSubmissionId, setOpenSubmissionId] = useState<string | null>(null);

  return (
    <>
      <div className="zoj-submissions-surface">
        <table className="zoj-submissions-table w-full min-w-[980px] table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">
            제출별 문제, 채점 결과와 실행 정보
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-white text-xs font-black text-slate-950">
              <th className={`${headerCellClassName} w-28`}>제출번호</th>
              <th className={`${headerCellClassName} w-40`}>이름</th>
              <th className={`${headerCellClassName} w-24`}>문제</th>
              <th className={`${headerCellClassName} w-44`}>결과</th>
              <th className={`${headerCellClassName} w-28`}>메모리</th>
              <th className={`${headerCellClassName} w-24`}>시간</th>
              <th className={`${headerCellClassName} w-36`}>언어</th>
              <th className={`${headerCellClassName} w-28`}>코드 길이</th>
              <th className={`${headerCellClassName} w-36`}>제출한 시간</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((submission) => {
              const name = submissionName(
                submission,
                fallbackTeamName,
                fallbackMemberName,
              );
              const problemId = submissionProblemId(submission, problemById);
              const sourceCode = submissionSourceCode(submission);
              const recency = submissionRecencyStrength(
                submission.submitted_at,
                now,
              );

              const isOpen = openSubmissionId === submission.submission_id;

              return (
                <Fragment key={submission.submission_id}>
                  <tr
                    className="zoj-submission-row zoj-submission-recency border-b border-slate-200"
                    data-recent-submission={recency > 0}
                    style={
                      {
                        '--zoj-submission-recency': `${recency * 100}%`,
                      } as CSSProperties
                    }
                  >
                    <td
                      data-label="제출번호"
                      className={`${cellClassName} font-mono text-xs font-medium`}
                      title={submission.submission_id}
                    >
                      {displaySubmissionId(submission.submission_id)}
                    </td>
                    <td
                      className={`${cellClassName} font-bold`}
                      data-label="이름"
                      title={name}
                    >
                      <span className="zoj-truncate-safe max-w-full">
                        {name}
                      </span>
                    </td>
                    <td
                      className={`${cellClassName} font-bold`}
                      data-label="문제"
                      title={submissionProblemTitle(submission, problemById)}
                    >
                      {preview ? (
                        <span className="zoj-truncate-safe max-w-full">
                          {submissionProblem(submission, problemById)}
                        </span>
                      ) : (
                        <Link
                          className="zoj-truncate-safe hover:text-zoj-blue max-w-full transition"
                          to={`/contests/${contestId}/problems/${problemId}`}
                        >
                          {submissionProblem(submission, problemById)}
                        </Link>
                      )}
                    </td>
                    <td data-label="결과" className={cellClassName}>
                      <ContestSubmissionResultBadge
                        judgeMessage={submission.judge_message}
                        submission={submission}
                        status={submission.status}
                      />
                    </td>
                    <td data-label="메모리" className={cellClassName}>
                      {formatMemoryKb(submissionMemory(submission))}
                    </td>
                    <td data-label="시간" className={cellClassName}>
                      {formatTimeMs(submissionTime(submission))}
                    </td>
                    <td data-label="언어 · 코드" className={cellClassName}>
                      <span className="inline-flex max-w-full items-center gap-3">
                        <button
                          aria-expanded={isOpen}
                          className="zoj-truncate-safe hover:text-zoj-blue max-w-full font-bold text-slate-950 transition disabled:cursor-not-allowed disabled:text-slate-400"
                          disabled={!sourceCode && !loadSource}
                          onClick={() =>
                            setOpenSubmissionId((current) =>
                              current === submission.submission_id
                                ? null
                                : submission.submission_id,
                            )
                          }
                          title={
                            sourceCode || loadSource
                              ? '제출 코드 보기'
                              : '코드가 포함되지 않은 제출입니다.'
                          }
                          type="button"
                        >
                          {judgeLanguageLabel(submission.language)}
                        </button>
                        {(sourceCode || loadSource) && !preview ? (
                          <Link
                            className="text-zoj-blue text-xs font-black whitespace-nowrap transition hover:text-slate-950"
                            to={`/contests/${contestId}/problems/${problemId}/submit?submissionId=${encodeURIComponent(submission.submission_id)}`}
                          >
                            수정
                          </Link>
                        ) : null}
                      </span>
                    </td>
                    <td data-label="코드 길이" className={cellClassName}>
                      {formatCodeLength(submission)}
                    </td>
                    <td data-label="제출한 시간" className={cellClassName}>
                      <time
                        dateTime={submission.submitted_at}
                        title={
                          Number.isFinite(
                            new Date(submission.submitted_at).getTime(),
                          )
                            ? formatDateTime(submission.submitted_at)
                            : undefined
                        }
                      >
                        {formatRelativeTime(submission.submitted_at, now)}
                      </time>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="zoj-submission-code-row border-b border-slate-200 bg-white">
                      <td className="min-w-0 p-0" colSpan={9}>
                        {sourceCode || !loadSource ? (
                          <SubmissionCodeAccordion
                            sourceCode={sourceCode}
                            submission={submission}
                          />
                        ) : (
                          <LazySubmissionCode
                            contestId={contestId}
                            submission={submission}
                            loadSource={loadSource}
                            scopeKey={sourceScopeKey}
                          />
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LazySubmissionCode({
  contestId,
  submission,
  loadSource,
  scopeKey,
}: {
  contestId: string;
  submission: Submission;
  loadSource: (id: string) => Promise<string>;
  scopeKey?: string;
}) {
  const source = useQuery({
    queryKey: [
      'contest-submission-source',
      contestId,
      submission.submission_id,
      scopeKey,
    ],
    queryFn: () => loadSource(submission.submission_id),
    placeholderData: () => undefined,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });
  if (source.isPending)
    return (
      <p className="p-4 text-sm text-slate-500" role="status">
        코드를 불러오는 중입니다.
      </p>
    );
  if (source.isError)
    return (
      <div className="p-4 text-sm text-slate-600" role="alert">
        코드를 불러오지 못했습니다.
        <button
          className="text-zoj-blue ml-3 font-bold"
          onClick={() => void source.refetch()}
          type="button"
        >
          다시 시도
        </button>
      </div>
    );
  return (
    <SubmissionCodeAccordion submission={submission} sourceCode={source.data} />
  );
}

function SubmissionCodeAccordion({
  sourceCode,
  submission,
}: {
  sourceCode: string;
  submission: Submission;
}) {
  return (
    <section className="grid min-w-0 gap-3 border-t border-slate-200 bg-slate-950 px-5 py-4 text-slate-50">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-400">제출 코드</p>
          <h2 className="mt-1 font-mono text-sm font-black">
            {displaySubmissionId(submission.submission_id)} ·{' '}
            {judgeLanguageLabel(submission.language)}
          </h2>
        </div>
        <button
          aria-label="제출 코드 복사"
          className="flex size-9 items-center justify-center rounded border border-slate-700 text-slate-200 transition hover:border-slate-400 hover:text-white"
          onClick={() => void navigator.clipboard?.writeText(sourceCode)}
          title="제출 코드 복사"
          type="button"
        >
          <SvgIcon name="clipboard" size={16} />
        </button>
      </header>
      <pre className="max-h-[420px] min-h-36 overflow-auto rounded border border-slate-800 bg-slate-900 p-4 text-sm leading-6 text-slate-50">
        <code>{sourceCode}</code>
      </pre>
    </section>
  );
}
