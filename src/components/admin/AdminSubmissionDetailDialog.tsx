import SubmissionDetailContent from '@/components/operator/SubmissionDetailContent';
import SubmissionRejudgingHistory from '@/components/operator/SubmissionRejudgingHistory';
import type { AdminJudgeSubmissionEntry } from '@/domains/auditMonitoring/types';
import { contestStaffDisplayName } from '@/domains/identityAccess/staffDisplay';
import type { Submission } from '@/domains/submissionScoreboard/types';
import { formatApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dateTime';
import { formatMemoryKb } from '@/shared/lib/formatters';
import ModalDialog from '@/shared/ui/ModalDialog';

type AdminSubmissionDetailDialogProps = {
  entry?: AdminJudgeSubmissionEntry;
  error: unknown;
  isLoading: boolean;
  onClose: () => void;
  token?: string;
};

function isOperatorTest(entry: AdminJudgeSubmissionEntry) {
  const { submission } = entry;
  return (
    submission.submission_kind === 'operator_test' ||
    (
      entry.team?.team_name ??
      submission.team_name ??
      submission.team?.team_name
    )?.startsWith('__operator_test__:') ||
    submission.participant_team_id?.startsWith('__operator_test__:')
  );
}

function ownerLabel(entry: AdminJudgeSubmissionEntry) {
  const { submission } = entry;
  if (submission.submission_kind === 'mock_judging') return '모의채점';
  if (
    isOperatorTest(entry) ||
    submission.submission_kind === 'participant_preview'
  ) {
    return contestStaffDisplayName(
      submission.submitted_by_name,
      submission.submitted_by_title,
    );
  }
  const teamName =
    entry.team?.team_name ?? submission.team_name ?? submission.team?.team_name;
  const memberName =
    entry.member?.name ?? submission.member_name ?? submission.member?.name;
  if (teamName && memberName) return `${teamName}(${memberName})`;
  return teamName || memberName || '-';
}

function kindLabel(entry: AdminJudgeSubmissionEntry) {
  if (entry.submission.submission_kind === 'participant_preview')
    return '참가자 미리보기';
  if (isOperatorTest(entry)) return '문제 검수·테스트';
  if (entry.submission.submission_kind === 'mock_judging') return '모의채점';
  return '참가자 제출';
}

function problemLabel(entry: AdminJudgeSubmissionEntry) {
  const { submission } = entry;
  const code =
    entry.problem?.problem_code ??
    submission.problem?.problem_code ??
    submission.problem_code;
  const title =
    entry.problem?.title ??
    submission.problem?.title ??
    submission.problem_title;
  return code && title
    ? `${code}. ${title}`
    : title || code || submission.problem_id;
}

function runtimeLabel(value?: number | null) {
  return value == null ? '-' : `${value.toLocaleString('ko-KR')} ms`;
}

function codeLengthLabel(submission: Submission) {
  const length =
    submission.code_length_bytes ??
    submission.source_code_length ??
    submission.source_code?.length;
  return typeof length === 'number'
    ? `${length.toLocaleString('ko-KR')} B`
    : '-';
}

export default function AdminSubmissionDetailDialog({
  entry,
  error,
  isLoading,
  onClose,
  token,
}: AdminSubmissionDetailDialogProps) {
  const submission = entry?.submission;
  const owner = entry ? ownerLabel(entry) : '';
  return (
    <ModalDialog
      aria-label="제출 상세"
      onClose={onClose}
      title={entry ? problemLabel(entry) : '제출 상세'}
      eyebrow={
        submission
          ? `제출 상세 · ${submission.submission_id.split('-')[0] || submission.submission_id}`
          : '제출 상세'
      }
      description={
        submission
          ? `${owner} · ${formatDateTime(submission.submitted_at)}`
          : undefined
      }
      size="wide"
      fill
      customBody
    >
      <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
        {isLoading && !entry && !error ? (
          <p
            role="status"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500"
          >
            제출 상세를 불러오는 중입니다.
          </p>
        ) : null}
        {isLoading && entry && !error ? (
          <p role="status" className="mb-4 text-xs text-slate-500">
            제출 상세를 업데이트 중입니다.
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
          >
            {formatApiError(error, '제출 상세를 불러오지 못했습니다')}
          </p>
        ) : null}
        {entry && submission && !error ? (
          <SubmissionDetailContent
            key={submission.submission_id}
            submission={submission}
            owner={owner}
            kind={kindLabel(entry)}
            runtime={runtimeLabel(
              submission.runtime_ms ??
                submission.time_ms ??
                submission.execution_time_ms,
            )}
            memory={formatMemoryKb(
              submission.memory_kb ??
                submission.memory_usage_kb ??
                submission.max_memory_kb,
            )}
            codeLength={codeLengthLabel(submission)}
          >
            {token && entry.contest?.contest_id ? (
              <SubmissionRejudgingHistory
                key={`history:${submission.submission_id}`}
                contestId={entry.contest.contest_id}
                submissionId={submission.submission_id}
                token={token}
              />
            ) : null}
            <AdminJudgeContext entry={entry} />
          </SubmissionDetailContent>
        ) : null}
      </div>
    </ModalDialog>
  );
}

function ContextValue({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm leading-6 [overflow-wrap:anywhere] break-words text-slate-700 select-all">
        {value || '-'}
      </dd>
    </div>
  );
}

function AdminJudgeContext({ entry }: { entry: AdminJudgeSubmissionEntry }) {
  const { submission, judge_job: job, judge_node: node } = entry;
  return (
    <details className="zoj-inset">
      <summary className="cursor-pointer text-sm font-medium text-slate-600">
        관리자 채점 정보
      </summary>
      <dl className="mt-4 grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
        <ContextValue label="대회" value={entry.contest?.title} />
        <ContextValue label="참가 유형" value={entry.division?.name} />
        <ContextValue
          label="계정 정보"
          value={
            submission.submitted_by_email ??
            entry.member?.email ??
            submission.member_email ??
            submission.member?.email
          }
        />
        <ContextValue
          label="채점기"
          value={node?.node_name ?? job?.assigned_node_id}
        />
        <ContextValue
          label="채점 노드 ID"
          value={node?.judge_node_id ?? job?.assigned_node_id}
        />
        <ContextValue label="채점 작업 ID" value={job?.judge_job_id} />
        <ContextValue label="에이전트 버전" value={node?.agent_version} />
        <ContextValue label="작업 상태" value={job?.status} />
        <ContextValue
          label="활성 테스트케이스"
          value={`${entry.active_testcase_count.toLocaleString('ko-KR')}개`}
        />
        {entry.problem ? (
          <ContextValue
            label="문제 기본 제한"
            value={`${runtimeLabel(entry.problem.time_limit_ms)} · ${entry.problem.memory_limit_mb.toLocaleString('ko-KR')} MB`}
          />
        ) : null}
      </dl>
    </details>
  );
}
