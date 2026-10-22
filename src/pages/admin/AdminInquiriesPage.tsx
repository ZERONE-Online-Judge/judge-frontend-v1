import useAdminView from '@/components/admin/useAdminView';
import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminAccessGate,
  AdminPanel,
  AdminLayout,
  AdminViewTabs,
} from '@/components/admin/AdminShell';
import {
  answerAdminContactInquiry,
  listAdminContactInquiries,
} from '@/domains/serviceCommunication/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dateTime';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';

export default function AdminInquiriesPage() {
  return (
    <AdminAccessGate>
      {(session) => <AdminInquiriesContent token={session.accessToken} />}
    </AdminAccessGate>
  );
}

function AdminInquiriesContent({ token }: { token: string }) {
  const isVisible = useDocumentVisibility();
  const queryClient = useQueryClient();
  const queryIdentity = tokenQueryIdentity(token);
  const [expandedId, setExpandedId] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [view, setView] = useAdminView(
    ['all', 'pending', 'answered'] as const,
    'all',
  );

  const inquiriesQuery = useQuery({
    queryKey: ['admin', 'contact-inquiries', queryIdentity],
    queryFn: () => listAdminContactInquiries(token),
    refetchInterval: isVisible ? 30_000 : false,
  });

  const answerMutation = useMutation({
    mutationFn: ({
      answerBody,
      inquiryId,
    }: {
      answerBody: string;
      inquiryId: string;
    }) =>
      answerAdminContactInquiry(inquiryId, token, {
        answer_body: answerBody,
      }),
    onSuccess: (inquiry) => {
      setAnswers((prev) => ({ ...prev, [inquiry.contact_inquiry_id]: '' }));
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'contact-inquiries'],
      });
    },
  });

  const inquiries = inquiriesQuery.data ?? [];
  const pendingCount = inquiries.filter(
    (inquiry) => inquiry.status !== 'answered',
  ).length;
  const visibleInquiries = inquiries.filter(
    (inquiry) =>
      view === 'all' ||
      (view === 'answered'
        ? inquiry.status === 'answered'
        : inquiry.status !== 'answered'),
  );

  function submitAnswer(event: FormEvent<HTMLFormElement>, inquiryId: string) {
    event.preventDefault();
    const answerBody = (answers[inquiryId] ?? '').trim();
    if (!answerBody) return;
    answerMutation.mutate({ answerBody, inquiryId });
  }

  return (
    <AdminLayout
      description="서비스 문의를 최근순으로 확인하고 답변 메일을 발송합니다."
      title="문의 관리"
    >
      {inquiriesQuery.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {formatApiError(
            inquiriesQuery.error,
            '문의 목록을 불러오지 못했습니다',
          )}
        </div>
      ) : null}

      <AdminViewTabs
        label="문의 처리 상태"
        value={view}
        onChange={setView}
        items={[
          { label: '전체 문의', value: 'all' },
          { label: `답변 필요 ${pendingCount}`, value: 'pending' },
          { label: '답변 완료', value: 'answered' },
        ]}
      />
      <AdminPanel
        description={`최근 접수된 문의입니다. 답변 필요 ${pendingCount.toLocaleString('ko-KR')}건`}
        title="서비스 문의"
      >
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {visibleInquiries.length > 0 ? (
            visibleInquiries.map((inquiry) => {
              const expanded = expandedId === inquiry.contact_inquiry_id;
              return (
                <article key={inquiry.contact_inquiry_id}>
                  <button
                    aria-expanded={expanded}
                    className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-indigo-50/40"
                    onClick={() =>
                      setExpandedId(expanded ? '' : inquiry.contact_inquiry_id)
                    }
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={inquiry.status} />
                        <strong
                          className="zoj-break-anywhere min-w-0 text-base font-semibold text-slate-950"
                          title={inquiry.title}
                        >
                          {inquiry.title}
                        </strong>
                      </span>
                      <span className="zoj-break-anywhere mt-1 block text-sm font-medium text-slate-500">
                        {inquiry.sender_name} · {inquiry.sender_email} ·{' '}
                        {formatDateTime(inquiry.created_at)}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-indigo-700">
                      {expanded ? '접기' : '보기'}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="grid gap-5 border-t border-slate-100 bg-slate-50/50 px-4 py-5">
                      <InquiryBlock label="문의 본문" value={inquiry.body} />
                      {inquiry.answer_body ? (
                        <div className="grid gap-3">
                          <InquiryBlock
                            label="답변 내역"
                            value={inquiry.answer_body}
                          />
                          <p className="zoj-break-anywhere text-xs font-medium text-slate-500">
                            {inquiry.answered_by_email ?? '-'} ·{' '}
                            {inquiry.answered_at
                              ? formatDateTime(inquiry.answered_at)
                              : '-'}
                          </p>
                        </div>
                      ) : null}

                      <form
                        className="grid gap-3"
                        onSubmit={(event) =>
                          submitAnswer(event, inquiry.contact_inquiry_id)
                        }
                      >
                        <label className="grid gap-2 text-sm font-semibold text-slate-700">
                          답변 작성
                          <textarea
                            className="min-h-32 resize-y rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm leading-6 font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            onChange={(event) =>
                              setAnswers((prev) => ({
                                ...prev,
                                [inquiry.contact_inquiry_id]:
                                  event.target.value,
                              }))
                            }
                            value={answers[inquiry.contact_inquiry_id] ?? ''}
                          />
                        </label>
                        <button
                          className="h-10 w-fit rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:bg-slate-300"
                          disabled={
                            answerMutation.isPending ||
                            !(answers[inquiry.contact_inquiry_id] ?? '').trim()
                          }
                          type="submit"
                        >
                          {answerMutation.isPending ? '발송 중' : '답변 발송'}
                        </button>
                        {answerMutation.error ? (
                          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                            {formatApiError(
                              answerMutation.error,
                              '답변 발송에 실패했습니다',
                            )}
                          </p>
                        ) : null}
                      </form>
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <p className="px-4 py-10 text-center text-sm font-medium text-slate-500">
              {inquiriesQuery.isLoading
                ? '문의를 불러오는 중입니다.'
                : view !== 'all'
                  ? '해당 상태의 문의가 없습니다.'
                  : '접수된 문의가 없습니다.'}
            </p>
          )}
        </div>
      </AdminPanel>
    </AdminLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const answered = status === 'answered';
  return (
    <span
      className={[
        'rounded-full px-3 py-1 text-xs font-semibold',
        answered
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-amber-50 text-amber-700',
      ].join(' ')}
    >
      {answered ? '답변완료' : '답변필요'}
    </span>
  );
}

function InquiryBlock({ label, value }: { label: string; value: string }) {
  return (
    <section className="grid min-w-0 gap-2">
      <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
      <div className="zoj-break-anywhere rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 font-medium whitespace-pre-wrap text-slate-700">
        {value}
      </div>
    </section>
  );
}
