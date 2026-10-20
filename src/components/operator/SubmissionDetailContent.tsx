import BoundedText from '@/shared/ui/BoundedText';
import { useState } from 'react';
import { parseVerificationDetails } from '@/domains/problemManagement/verificationDetails';
import { judgeLanguageLabel } from '@/domains/submissionScoreboard/languageLabel';
import {
  isSubmissionPending,
  submissionProgressPercent,
  submissionProgressText,
  submissionStatusLabel,
  submissionStatusTone,
} from '@/domains/submissionScoreboard/status';
import type { Submission } from '@/domains/submissionScoreboard/types';
import { formatDateTime } from '@/shared/lib/dateTime';
import { ModalButton } from '@/shared/ui/ModalDialog';

const resultColors = {
  success: 'text-emerald-700',
  waiting: 'text-amber-700',
  judging: 'text-amber-700',
  runtime: 'text-purple-700',
  danger: 'text-rose-700',
  neutral: 'text-slate-800',
};

export default function SubmissionDetailContent({
  submission,
  owner,
  kind,
  runtime,
  memory,
  codeLength,
}: {
  submission: Submission;
  owner: string;
  kind: string;
  runtime: string;
  memory: string;
  codeLength: string;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );
  const [wrapCode, setWrapCode] = useState(false);
  const detail = parseVerificationDetails(submission.judge_message);
  const failedCase = submission.failed_testcase_order ?? detail.testcaseOrder;
  const pending = isSubmissionPending(submission.status);
  const language = judgeLanguageLabel(submission.language);
  const hasDiagnostics = Boolean(
    submission.compile_message?.trim() || submission.judge_message?.trim(),
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(submission.source_code ?? '');
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <section aria-label="채점 결과" className="zoj-card">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
          <div role="status" className="min-w-0">
            <p className="text-xs font-medium text-slate-500">채점 결과</p>
            <h3
              className={`mt-1 text-2xl font-semibold tracking-tight ${resultColors[submissionStatusTone(submission.status)]}`}
            >
              {submissionStatusLabel(submission.status)}
            </h3>
            {failedCase != null ? (
              <p className="mt-1.5 text-sm text-slate-600">
                테스트케이스 #{failedCase}에서 종료
              </p>
            ) : null}
          </div>
          <dl className="grid w-full flex-none grid-cols-3 gap-x-4 gap-y-3 sm:w-auto sm:max-w-md sm:flex-1 sm:gap-x-8">
            <Info label="실행 시간" value={runtime} />
            <Info label="사용 메모리" value={memory} />
            <Info label="언어" value={language} />
          </dl>
        </div>
        {pending ? (
          <div className="mt-5 grid gap-2">
            <progress
              aria-label="채점 진행률"
              className="h-1.5 w-full accent-indigo-600"
              max={100}
              value={submissionProgressPercent(submission) ?? undefined}
            />
            <p className="text-xs text-slate-500">
              {submissionProgressText(submission) ||
                '채점 결과를 기다리고 있습니다.'}
            </p>
          </div>
        ) : null}
      </section>

      <section aria-label="소스 코드" className="min-w-0">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">소스 코드</h3>
            <p className="mt-1 text-xs text-slate-500">
              {language} · {codeLength}
            </p>
          </div>
          {submission.source_code ? (
            <div className="flex flex-wrap items-center gap-2">
              <ModalButton
                aria-pressed={wrapCode}
                onClick={() => setWrapCode((value) => !value)}
              >
                줄바꿈 {wrapCode ? '켜짐' : '꺼짐'}
              </ModalButton>
              <ModalButton onClick={() => void copyCode()}>
                {copyState === 'copied' ? '복사됨' : '코드 복사'}
              </ModalButton>
            </div>
          ) : null}
        </header>
        {copyState === 'error' ? (
          <p role="alert" className="mb-3 text-xs text-rose-700">
            복사하지 못했습니다. 코드를 직접 선택해 복사해 주세요.
          </p>
        ) : null}
        {copyState === 'copied' ? (
          <span role="status" className="sr-only">
            코드를 복사했습니다.
          </span>
        ) : null}
        {submission.source_code ? (
          <BoundedText
            aria-label="제출한 소스 코드"
            tabIndex={0}
            className={`max-h-[min(28rem,55dvh)] min-h-32 overflow-auto rounded-[var(--zoj-radius-inset)] bg-slate-950 p-4 font-mono text-[13px] leading-6 text-slate-100 outline-offset-4 sm:p-5 ${wrapCode ? 'break-all whitespace-pre-wrap' : 'whitespace-pre'}`}
          >
            <code>{submission.source_code}</code>
          </BoundedText>
        ) : (
          <p className="zoj-inset text-sm text-slate-500">
            표시할 소스 코드가 없습니다.
          </p>
        )}
      </section>

      {hasDiagnostics ? (
        <details
          className="zoj-card"
          open={submission.status === 'compile_error'}
        >
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            채점 상세
            <span className="ml-2 text-xs font-normal text-slate-500">
              {failedCase != null
                ? `실패 테스트케이스 #${failedCase} · 입력과 출력 비교`
                : submission.status === 'compile_error'
                  ? '컴파일 오류 확인'
                  : '메시지와 로그'}
            </span>
          </summary>
          <div className="mt-5 grid min-w-0 gap-5">
            {submission.compile_message?.trim() ? (
              <LogBlock
                label="컴파일 로그"
                value={submission.compile_message}
              />
            ) : null}
            {detail.message ? (
              <LogBlock label="채점 메시지" value={detail.message} />
            ) : null}
            {detail.input !== undefined ? (
              <>
                <LogBlock label="실패 입력" value={detail.input} />
                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  <LogBlock label="기대 출력" value={detail.expected ?? ''} />
                  <LogBlock label="실제 출력" value={detail.actual ?? ''} />
                </div>
              </>
            ) : null}
            {submission.judge_message?.trim() ? (
              <details className="min-w-0 border-t border-[var(--zoj-border)] pt-4">
                <summary className="cursor-pointer text-xs text-slate-500">
                  원본 채점 로그
                </summary>
                <div className="mt-3">
                  <LogBlock
                    label="채점 로그"
                    value={submission.judge_message}
                  />
                </div>
              </details>
            ) : null}
          </div>
        </details>
      ) : null}

      <details className="zoj-inset">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">
          제출 정보
        </summary>
        <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <Info label="팀/계정" value={owner} />
          <Info label="제출 구분" value={kind} />
          <Info
            label="제출 시각"
            value={formatDateTime(submission.submitted_at)}
          />
          <Info label="코드 길이" value={codeLength} />
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">제출 ID</dt>
            <dd className="mt-1 font-mono text-xs break-all text-slate-600 select-all">
              {submission.submission_id}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1.5 text-sm font-medium break-words text-slate-900">
        {value}
      </dd>
    </div>
  );
}

function LogBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-2">
      <h4 className="text-xs font-medium text-slate-600">{label}</h4>
      <BoundedText
        aria-label={label}
        tabIndex={0}
        className="max-h-64 min-w-0 overflow-auto rounded-[var(--zoj-radius-inset)] border border-[var(--zoj-border)] bg-white p-4 font-mono text-xs leading-6 whitespace-pre text-slate-700 outline-offset-4"
      >
        {value || '(비어 있음)'}
      </BoundedText>
    </div>
  );
}
