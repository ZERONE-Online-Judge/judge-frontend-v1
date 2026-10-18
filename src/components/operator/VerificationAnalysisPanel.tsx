import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useState } from 'react';
import VerificationAgentEvidence from '@/components/operator/VerificationAgentEvidence';
import VerificationMarkdown from '@/components/operator/VerificationMarkdown';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import {
  getVerificationAnalysis,
  downloadVerificationWorkspace,
  requestVerificationAnalysis,
  type VerificationAnalysis,
  type VerificationReport,
} from '@/domains/problemManagement/verificationAi';
import { formatApiError } from '@/shared/api/errors';

export default function VerificationAnalysisPanel({
  contestId,
  problemId,
  submissionId,
  token,
  available,
  initial,
  stale,
}: {
  contestId: string;
  problemId: string;
  submissionId: string;
  token: string;
  available: boolean;
  initial?: VerificationAnalysis | null;
  stale?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const queryKey = [
    'operator',
    'verification-analysis',
    contestId,
    problemId,
    submissionId,
    tokenQueryIdentity(token),
  ];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      getVerificationAnalysis(contestId, problemId, submissionId, token),
    enabled: open,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (state) => {
      const data = state.state.data;
      return data?.available &&
        data.analysis &&
        ['queued', 'running'].includes(data.analysis.status)
        ? 3000
        : false;
    },
  });
  const request = useMutation({
    mutationFn: () =>
      requestVerificationAnalysis(contestId, problemId, submissionId, token),
    onSuccess: (data) => {
      client.setQueryData(queryKey, data);
      void client.invalidateQueries({
        queryKey: ['operator', 'verification-runs', contestId, problemId],
      });
    },
  });
  const download = useMutation({
    mutationFn: () =>
      downloadVerificationWorkspace(contestId, problemId, submissionId, token),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'verification-workspace.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  const analysis = open
    ? (query.data?.analysis ?? initial)
    : (initial ?? query.data?.analysis);
  const canRequest = query.data?.available ?? available;
  const status = analysis?.status;
  const label =
    status === 'succeeded'
      ? '저장된 AI 분석 보기'
      : status === 'queued'
        ? 'AI 분석 대기 중'
        : status === 'running'
          ? 'AI 분석 중'
          : status === 'failed'
            ? 'AI 분석 실패'
            : 'AI 분석하기';
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
          disabled={request.isPending}
          onClick={() => {
            if (!analysis || status === 'awaiting_request') {
              setOpen(true);
              if (canRequest) request.mutate();
            } else setOpen(!open);
          }}
        >
          {label}{' '}
          <span aria-hidden="true">
            <InterfaceIcon name={open ? 'chevronUp' : 'chevronDown'} />
          </span>
        </button>
        {status === 'succeeded' ? (
          <span className="text-xs text-slate-500">
            운영자 공유 · 저장된 결과 재사용
          </span>
        ) : null}
        {stale ? (
          <span className="text-xs font-medium text-amber-800">
            문제 자료가 변경됨 · 이전 채점 기준
          </span>
        ) : null}
      </div>
      {!analysis || status === 'awaiting_request' ? (
        <p className="text-xs text-slate-600">
          버튼을 눌러야 AI 검증을 시작합니다. 판정 결과만으로 자동 분석하지
          않습니다.
        </p>
      ) : null}
      {open ? (
        <section
          aria-label="AI 판정 분석"
          className="grid min-w-0 gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4"
        >
          {analysis?.report ? (
            <ReportBody report={analysis.report} analysis={analysis} />
          ) : null}
          {analysis?.stop_reason ? (
            <p
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900"
            >
              {analysis.stop_reason.message}
            </p>
          ) : null}
          {!canRequest ? (
            <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
              AI 연결이 설정되지 않았습니다. 관리자가 서버 환경변수를 설정하면
              AI 분석하기 버튼으로 분석을 요청할 수 있습니다. 저장된 분석은 계속
              볼 수 있습니다.
            </p>
          ) : null}
          {query.isLoading ? (
            <p role="status" className="text-sm text-indigo-700">
              저장된 분석을 확인하고 있습니다.
            </p>
          ) : null}
          {status === 'queued' || status === 'running' ? (
            <div
              role="status"
              aria-live="polite"
              className="grid gap-2 rounded-xl border border-indigo-100 bg-white p-4"
            >
              <div className="flex items-center gap-2 font-semibold text-indigo-900">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-indigo-500 motion-safe:animate-pulse"
                />
                {status === 'queued' ? '분석 대기 중' : '분석 진행 중'}
              </div>
              <p className="text-sm text-slate-600">
                {status === 'queued'
                  ? '분석 대기 중입니다. 대기 작업과 일일 사용 한도에 따라 시간이 걸릴 수 있습니다.'
                  : `${analysis?.phase || '문제와 코드, 테스트케이스를 검토하고 있습니다.'} · 이 화면을 닫아도 계속됩니다.`}
              </p>
              <p className="text-xs text-slate-500">
                분석이 끝나면 이곳에 요약과 권장 조치가 표시됩니다.
              </p>
            </div>
          ) : null}
          {analysis?.error_message || query.error || request.error ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
            >
              {request.error
                ? formatApiError(request.error, '분석 요청에 실패했습니다.')
                : query.error
                  ? formatApiError(query.error, '분석을 불러오지 못했습니다.')
                  : analysis?.error_message}
            </p>
          ) : null}
          {canRequest &&
          (status === 'failed' ||
            (analysis?.can_retry && !stale) ||
            (status === 'succeeded' &&
              analysis?.engine_version === 1 &&
              !stale)) ? (
            <button
              type="button"
              disabled={request.isPending}
              onClick={() => request.mutate()}
              className="w-fit rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {request.isPending
                ? '요청 중…'
                : status === 'failed'
                  ? '분석 다시 요청'
                  : analysis?.can_retry
                    ? '개선된 검증으로 다시 분석'
                    : status === 'succeeded'
                      ? '실제 채점으로 검증'
                      : 'AI 분석하기'}
            </button>
          ) : null}
          {canRequest && analysis?.can_retry && !stale ? (
            <p className="text-xs text-slate-500">
              기존 기록은 보존합니다. 버튼을 누르면 설정된 예산으로 새 분석을
              시작합니다.
            </p>
          ) : null}
          {analysis?.coverage ? (
            <details className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-800">
                분석 범위 ·{' '}
                {analysis.coverage.partial
                  ? '일부 자료만 검토'
                  : '제공 자료 전체'}{' '}
                · 테스트케이스 {analysis.coverage.full_testcases}/
                {analysis.coverage.total_testcases}개 전체 내용 포함
              </summary>
              <p>
                테스트케이스 v{analysis.coverage.testcase_version ?? '없음'} ·
                부분 포함 {analysis.coverage.partial_testcases}개 · 제외{' '}
                {analysis.coverage.omitted_testcases}개
              </p>
              {analysis.coverage.files.map((file, index) => (
                <p key={index} className="break-words">
                  {file.filename}:{' '}
                  {file.complete
                    ? '전체 포함'
                    : file.included
                      ? '일부 포함'
                      : '제외'}
                  {file.note ? ` · ${file.note}` : ''}
                </p>
              ))}
              {analysis.coverage.notes.map((note, index) => (
                <p key={index}>{note}</p>
              ))}
            </details>
          ) : null}
          {analysis ? <VerificationAgentEvidence analysis={analysis} /> : null}
          {analysis?.workspace_files?.length ? (
            <button
              type="button"
              onClick={() => download.mutate()}
              disabled={download.isPending}
              className="w-fit rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-800 disabled:opacity-50"
            >
              {download.isPending
                ? '다운로드 준비 중…'
                : '작업 파일 전체 다운로드'}
            </button>
          ) : null}
          {download.error ? (
            <p role="alert" className="text-sm text-rose-800">
              {formatApiError(
                download.error,
                '작업 파일 다운로드에 실패했습니다.',
              )}
            </p>
          ) : null}
          {analysis?.can_retry &&
          analysis.report?.report_kind !== 'investigation' ? (
            <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">
              이전 방식으로 작성된 보고서입니다. 반례의 유효성과 조치 방향은 새
              검증에서 다시 확인할 수 있습니다. 위의 ‘개선된 검증으로 다시
              분석’을 눌러 시작하세요.
            </p>
          ) : null}
          <p className="text-xs leading-5 text-slate-600">
            {analysis?.engine_version === 2
              ? '필요한 자료와 실제 실행을 바탕으로 판정 차이·테스트 누락·풀이와 채점 기준을 조사합니다. 공식 판정은 바꾸지 않으며, 실행 기록과 AI 의견을 함께 확인하세요.'
              : '실제 채점 당시 자료를 검토한 AI 보조 의견입니다. 공식 판정은 바꾸지 않으며, 제안한 수정과 반례는 다시 채점해 확인하세요.'}
          </p>
          {analysis ? (
            <p className="text-xs text-slate-500">
              {analysis.model}
              {analysis.completed_at
                ? ` · ${new Date(analysis.completed_at).toLocaleString('ko-KR')}`
                : ''}{' '}
              · 같은 자료와 판정의 분석을 서버에 보관합니다.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function ReportBody({
  report,
  analysis,
}: {
  report: VerificationReport;
  analysis?: VerificationAnalysis;
}) {
  return (
    <div className="grid min-w-0 gap-5 text-sm leading-7 text-slate-700">
      <section
        aria-label="분석 요약"
        className="grid min-w-0 gap-3 rounded-xl border border-indigo-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-bold tracking-tight text-slate-950">
            분석 요약
          </h4>
          {report.conclusion || analysis?.phase ? (
            <span
              className={
                'rounded-full px-2.5 py-1 text-xs font-medium ' +
                (report.conclusion === 'inconclusive' ||
                analysis?.phase?.includes('일부')
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-indigo-50 text-indigo-700')
              }
            >
              {report.conclusion
                ? {
                    test_gap: '테스트 보강 필요',
                    expectation_error: '기대 판정 검토',
                    solution_error: '풀이 검토',
                    judge_issue: '채점 기준 검토',
                    infrastructure_issue: '환경 점검 필요',
                    inconclusive: '추가 검증 필요',
                  }[report.conclusion]
                : analysis?.phase}
            </span>
          ) : null}
        </div>
        <div className="text-slate-950 [&_p]:text-base [&_p]:leading-8 [&_p]:font-medium">
          <VerificationMarkdown>{report.summary}</VerificationMarkdown>
        </div>
        {report.verdict_assessment ? (
          <div className="border-t border-slate-100 pt-2 text-slate-600">
            <VerificationMarkdown>
              {report.verdict_assessment}
            </VerificationMarkdown>
          </div>
        ) : null}
      </section>
      {report.recommendations?.length ? (
        <section className="grid gap-3">
          <h4 className="font-semibold text-slate-950">권장 조치</h4>
          {report.recommendations.map((item, index) => (
            <article
              key={index}
              className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-white p-3"
            >
              <p className="text-xs font-medium text-indigo-700">
                {
                  {
                    testcases: '테스트 보강',
                    expectation: '기대 판정 재검토',
                    solution: '풀이 수정',
                    judge: '채점 기준 검토',
                    infrastructure: '실행 환경 점검',
                    investigation: '추가 조사',
                  }[item.target]
                }
              </p>
              <h5 className="font-semibold text-slate-900">{item.title}</h5>
              <VerificationMarkdown>{item.action}</VerificationMarkdown>
              {item.verification ? (
                <VerificationMarkdown>{item.verification}</VerificationMarkdown>
              ) : null}
              {item.artifact_id ? (
                <p className="text-xs text-slate-500">
                  관련 후보: {item.artifact_id}
                </p>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
      {report.fixes.length ? (
        <section className="grid gap-3">
          <h4 className="font-semibold text-slate-950">
            이전 분석의 개선 제안
          </h4>
          {report.fixes.map((fix, index) => (
            <article
              key={index}
              className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-white p-3"
            >
              <h5 className="font-semibold text-slate-900">
                {index + 1}. {fix.title}
              </h5>
              <VerificationMarkdown>{fix.change}</VerificationMarkdown>
              {fix.code_example ? (
                <Code label="수정 예시" value={fix.code_example} />
              ) : null}
              <VerificationMarkdown>{`확인 방법: ${fix.verification}`}</VerificationMarkdown>
            </article>
          ))}
        </section>
      ) : null}
      {report.sections?.length || report.causes.length ? (
        <details className="group/report min-w-0 rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-900 focus-visible:outline-indigo-500">
            상세 분석과 근거{' '}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {(report.sections?.length ?? 0) + report.causes.length}개 항목
            </span>
          </summary>
          <div className="grid min-w-0 gap-3 border-t border-slate-100 p-4">
            {report.sections?.map((section, index) => (
              <section
                key={index}
                className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-white p-3"
              >
                <h4 className="font-semibold text-slate-950">
                  {section.title}
                </h4>
                <VerificationMarkdown>{section.body}</VerificationMarkdown>
                {section.evidence_refs.length ? (
                  <p className="text-xs break-all text-slate-500">
                    실행·자료 근거: {section.evidence_refs.join(' · ')}
                  </p>
                ) : null}
              </section>
            ))}
            {report.causes.length ? (
              <section className="grid gap-3">
                <h4 className="font-semibold text-slate-950">원인과 근거</h4>
                {report.causes.map((cause, index) => (
                  <article
                    key={index}
                    className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <h5 className="font-semibold text-slate-900">
                      {index + 1}. {cause.title}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        {
                          {
                            high: '근거 충분',
                            medium: '추가 확인 필요',
                            low: '가설',
                          }[cause.confidence]
                        }
                      </span>
                    </h5>
                    <VerificationMarkdown>
                      {cause.explanation}
                    </VerificationMarkdown>
                    <VerificationMarkdown>{`근거: ${cause.evidence}`}</VerificationMarkdown>
                    {cause.code_reference ? (
                      <VerificationMarkdown>{`관련 코드: ${cause.code_reference}`}</VerificationMarkdown>
                    ) : null}
                  </article>
                ))}
              </section>
            ) : null}
          </div>
        </details>
      ) : null}
      {report.suggested_tests.length ? (
        <details className="min-w-0 rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer p-4 font-semibold text-slate-950">
            추가할 테스트케이스 제안{' '}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {report.suggested_tests.length}개
            </span>
          </summary>
          <div className="grid min-w-0 gap-3 border-t border-slate-100 p-4">
            <p className="text-xs text-slate-500">
              제안 입력입니다. 실제 실행 여부는 채점 기록과 반례 교차 검증을
              확인하세요. 입력 조건과 기대 출력을 확인한 뒤 등록하세요.
            </p>
            {report.suggested_tests.map((test, index) => (
              <article
                key={index}
                className="grid min-w-0 gap-2 rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  <Code label="제안 입력" value={test.input} />
                  <Code label="제안 기대 출력" value={test.expected_output} />
                </div>
                <VerificationMarkdown>{test.explanation}</VerificationMarkdown>
              </article>
            ))}
          </div>
        </details>
      ) : null}
      {report.limitations.length ? (
        <details className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <summary className="cursor-pointer font-semibold text-amber-950">
            추가 확인이 필요한 점{' '}
            <span className="ml-2 text-xs font-normal text-amber-800">
              {report.limitations.length}개
            </span>
          </summary>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {report.limitations.map((item, index) => (
              <li key={index} className="break-words whitespace-pre-wrap">
                <VerificationMarkdown>{item}</VerificationMarkdown>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
function Code({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <pre
        aria-label={label}
        tabIndex={0}
        className="max-h-64 min-w-0 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-6 text-slate-100"
      >
        {value || '(빈 내용)'}
      </pre>
    </div>
  );
}
