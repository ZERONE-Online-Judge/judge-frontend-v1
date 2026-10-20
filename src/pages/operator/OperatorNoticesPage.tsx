import NoticeEditorFields, {
  type NoticeForm,
} from '@/components/operator/NoticeEditorFields';
import NoticeCountdownText, {
  NoticeCountdownCommands,
} from '@/components/contest/NoticeCountdownText';
import useConfirmation from '@/shared/ui/useConfirmation';
import { type FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import { sharedUiText } from '@/data/uiText';
import {
  OperatorAccessGate,
  OperatorPanel,
  OperatorTabs,
} from '@/components/operator/OperatorShell';
import {
  getOperatorContestDashboard,
  updateContestSettings,
} from '@/domains/contestAdministration/api';
import type { OperatorDashboard } from '@/domains/contestAdministration/types';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { hasContestPermission } from '@/domains/identityAccess/permissions';
import {
  createContestNotice,
  deleteContestNotice,
  listOperatorContestNotices,
  updateContestNotice,
} from '@/domains/serviceCommunication/api';
import type { ContestNotice } from '@/domains/serviceCommunication/types';
import { formatApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dateTime';
import PageNotice from '@/shared/ui/PageNotice';

const emptyNoticeForm: NoticeForm = {
  body: '',
  emergency: false,
  noticeId: '',
  pinned: false,
  title: '',
  visibility: 'participants',
};

type NoticeEditorMode = 'notice' | 'emergency';
const NOTICE_PAGE_SIZE = 5;

export default function OperatorNoticesPage() {
  const { contestId } = useParams();

  return (
    <OperatorAccessGate contestId={contestId} permission="contest.notice.view">
      {(session) =>
        contestId ? (
          <OperatorNoticesContent
            contestId={contestId}
            token={session.accessToken}
            canManage={hasContestPermission(
              session,
              contestId,
              'contest.notice.manage',
            )}
          />
        ) : (
          <PageLayout
            variant="management"
            title={sharedUiText.contestSelectionRequiredTitle}
          >
            {sharedUiText.contestSelectionRequiredBody}
          </PageLayout>
        )
      }
    </OperatorAccessGate>
  );
}

function OperatorNoticesContent({
  contestId,
  token,
  canManage,
}: {
  contestId: string;
  token: string;
  canManage: boolean;
}) {
  const { confirm: confirmAction, dialog: confirmationDialog } =
    useConfirmation();

  const queryClient = useQueryClient();
  const queryIdentity = tokenQueryIdentity(token);
  const [form, setForm] = useState(emptyNoticeForm);
  const [emergencyDraft, setEmergencyNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [editorMode, setEditorMode] = useState<NoticeEditorMode>('notice');
  const [expandedNoticeId, setExpandedNoticeId] = useState('');
  const [noticePage, setNoticePage] = useState(1);
  const dashboardQueryKey = [
    'operator',
    'dashboard',
    contestId,
    queryIdentity,
  ] as const;

  const dashboardQuery = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: () => getOperatorContestDashboard(contestId, token),
  });
  const noticesQuery = useQuery({
    queryKey: ['operator', 'notices', contestId, queryIdentity],
    queryFn: () => listOperatorContestNotices(contestId, token),
    refetchInterval: 15_000,
  });
  const noticesQueryKey = [
    'operator',
    'notices',
    contestId,
    queryIdentity,
  ] as const;

  const contest = dashboardQuery.data?.contest;
  const emergencyNotice =
    emergencyDraft ??
    contest?.emergency_notice_template ??
    contest?.emergency_notice ??
    '';
  const notices = noticesQuery.data ?? [];
  const isNoticeListLoading =
    noticesQuery.isPending || (noticesQuery.isFetching && !noticesQuery.data);
  const totalNoticePages = Math.max(
    1,
    Math.ceil(notices.length / NOTICE_PAGE_SIZE),
  );
  const pagedNotices = notices.slice(
    (noticePage - 1) * NOTICE_PAGE_SIZE,
    noticePage * NOTICE_PAGE_SIZE,
  );

  const saveNoticeMutation = useMutation({
    mutationFn: () =>
      form.noticeId
        ? updateContestNotice(contestId, form.noticeId, token, {
            body: form.body.trim(),
            emergency: form.emergency,
            pinned: form.pinned,
            title: form.title.trim(),
            visibility: form.visibility,
          })
        : createContestNotice(contestId, token, {
            body: form.body.trim(),
            emergency: form.emergency,
            pinned: form.pinned,
            title: form.title.trim(),
            visibility: form.visibility,
          }),
    onSuccess: (notice) => {
      setForm(emptyNoticeForm);
      setFormError('');
      queryClient.setQueryData<ContestNotice[]>(noticesQueryKey, (current) => {
        const items = current ?? [];
        const exists = items.some(
          (item) => item.contest_notice_id === notice.contest_notice_id,
        );
        const next = exists
          ? items.map((item) =>
              item.contest_notice_id === notice.contest_notice_id
                ? notice
                : item,
            )
          : [notice, ...items];
        return next.sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            new Date(b.published_at).getTime() -
              new Date(a.published_at).getTime(),
        );
      });
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'notices', contestId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'dashboard', contestId],
      });
    },
  });

  const saveEmergencyMutation = useMutation({
    mutationFn: (notice: string | null) =>
      updateContestSettings(contestId, token, {
        emergency_notice: notice?.trim() || null,
      }),
    onSuccess: (updatedContest) => {
      setEmergencyNotice(null);
      queryClient.setQueryData<OperatorDashboard>(
        dashboardQueryKey,
        (current) =>
          current
            ? {
                ...current,
                contest: updatedContest,
              }
            : current,
      );
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'dashboard', contestId],
      });
    },
  });

  const deleteNoticeMutation = useMutation({
    mutationFn: (noticeId: string) =>
      deleteContestNotice(contestId, noticeId, token),
    onSuccess: (_result, noticeId) => {
      if (form.noticeId === noticeId) {
        setForm(emptyNoticeForm);
        setFormError('');
      }
      queryClient.setQueryData<ContestNotice[]>(noticesQueryKey, (current) =>
        (current ?? []).filter(
          (notice) => notice.contest_notice_id !== noticeId,
        ),
      );
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'notices', contestId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'dashboard', contestId],
      });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      setFormError('공지 제목과 본문을 입력해야 합니다.');
      return;
    }
    saveNoticeMutation.mutate();
  }

  function editNotice(notice: ContestNotice) {
    setForm({
      body: notice.body_template ?? notice.body,
      emergency: notice.emergency,
      noticeId: notice.contest_notice_id,
      pinned: notice.pinned,
      title: notice.title,
      visibility: notice.visibility,
    });
    setEditorMode('notice');
  }

  async function removeNotice(notice: ContestNotice) {
    const confirmed = await confirmAction(
      `"${notice.title}" 공지를 삭제할까요? 삭제한 공지는 복구할 수 없습니다.`,
    );
    if (!confirmed) return;
    deleteNoticeMutation.mutate(notice.contest_notice_id);
  }

  function changeNoticePage(page: number) {
    setNoticePage(page);
    setExpandedNoticeId('');
  }

  return (
    <PageLayout
      variant="management"
      description="대회 공지와 긴급공지를 확인합니다."
      eyebrow="Operator"
      title={`${contest?.title ?? '대회'} 공지`}
      width="full"
    >
      {confirmationDialog}

      <OperatorTabs contestId={contestId} />

      {dashboardQuery.error || noticesQuery.error ? (
        <ErrorBox
          error={dashboardQuery.error || noticesQuery.error}
          fallback="공지 데이터를 불러오지 못했습니다"
        />
      ) : null}

      <div className="grid gap-6">
        {canManage ? (
          <OperatorPanel
            actions={
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  className={[
                    'h-9 rounded-lg px-4 text-sm font-semibold transition',
                    editorMode === 'notice'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-slate-950',
                  ].join(' ')}
                  onClick={() => setEditorMode('notice')}
                  type="button"
                >
                  공지 작성
                </button>
                <button
                  className={[
                    'h-9 rounded-lg px-4 text-sm font-semibold transition',
                    editorMode === 'emergency'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-slate-950',
                  ].join(' ')}
                  onClick={() => setEditorMode('emergency')}
                  type="button"
                >
                  긴급공지 관리
                </button>
              </div>
            }
            description={
              editorMode === 'notice'
                ? '새 공지를 작성하거나 기존 공지를 수정합니다.'
                : '전광판에 표시되는 현재 긴급공지 문구를 따로 관리합니다.'
            }
            title={editorMode === 'notice' ? '공지 작성' : '긴급공지 관리'}
          >
            {editorMode === 'notice' ? (
              <form className="grid gap-4" onSubmit={handleSubmit}>
                <NoticeEditorFields
                  form={form}
                  setForm={setForm}
                  contest={contest}
                  pending={saveNoticeMutation.isPending}
                />
                {formError || saveNoticeMutation.error ? (
                  <ErrorBox
                    error={saveNoticeMutation.error}
                    fallback={formError || '공지 저장에 실패했습니다'}
                  />
                ) : null}
              </form>
            ) : (
              <div className="grid gap-4">
                {contest?.emergency_notice ? (
                  <div className="grid gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-rose-600 uppercase">
                        현재 표시 중
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-rose-600">
                        전광판 노출
                      </span>
                    </div>
                    <p className="text-sm leading-6 font-medium whitespace-pre-wrap text-rose-700">
                      <NoticeCountdownText
                        text={contest.emergency_notice}
                        template={contest.emergency_notice_template}
                        contest={contest}
                      />
                    </p>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-medium text-slate-500">
                    현재 표시 중인 긴급공지 문구가 없습니다.
                  </p>
                )}
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 font-medium text-slate-500">
                  일반 공지를 긴급 공지로 저장하면 이 문구가 해당 공지 본문으로
                  자동 교체됩니다. 이후 문구 수정과 내리기는 이 관리 창에서 따로
                  처리할 수 있습니다.
                </p>
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveEmergencyMutation.mutate(emergencyNotice);
                  }}
                >
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    긴급공지 문구
                    <textarea
                      className="min-h-28 resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6 font-medium text-slate-950 transition outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                      onChange={(event) =>
                        setEmergencyNotice(event.target.value)
                      }
                      placeholder="전광판에 표시할 긴급공지 문구를 입력하세요."
                      value={emergencyNotice}
                    />
                  </label>
                  <NoticeCountdownCommands
                    onInsert={(command) =>
                      setEmergencyNotice(
                        [emergencyNotice.trimEnd(), command]
                          .filter(Boolean)
                          .join('\n'),
                      )
                    }
                  />
                  {emergencyNotice.includes('{{countdown:') ? (
                    <div className="rounded-lg border border-rose-100 bg-rose-50/50 px-4 py-3">
                      <p className="mb-1 text-xs font-semibold text-rose-600">
                        참가자에게 보이는 문구
                      </p>
                      <p className="text-sm leading-6 whitespace-pre-wrap text-slate-700">
                        <NoticeCountdownText
                          text={emergencyNotice}
                          contest={contest}
                        />
                      </p>
                    </div>
                  ) : null}
                  {saveEmergencyMutation.error ? (
                    <ErrorBox
                      error={saveEmergencyMutation.error}
                      fallback="긴급공지 저장에 실패했습니다"
                    />
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      className="h-10 rounded-lg border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:text-slate-300"
                      disabled={
                        saveEmergencyMutation.isPending ||
                        !contest?.emergency_notice
                      }
                      onClick={() => saveEmergencyMutation.mutate(null)}
                      type="button"
                    >
                      긴급공지 내리기
                    </button>
                    <button
                      className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:bg-slate-300"
                      disabled={
                        saveEmergencyMutation.isPending ||
                        !emergencyNotice.trim()
                      }
                      type="submit"
                    >
                      긴급공지 띄우기/수정
                    </button>
                  </div>
                </form>
              </div>
            )}
          </OperatorPanel>
        ) : null}

        <OperatorPanel
          description="참가자 화면 상단에 표시될 대회 공지입니다."
          title="공지 목록"
        >
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {isNoticeListLoading ? (
              <div className="px-4 py-6">
                <PageNotice
                  message="공지 목록을 불러오는 중입니다."
                  status="loading"
                />
              </div>
            ) : notices.length > 0 ? (
              pagedNotices.map((notice) => (
                <article
                  className="grid gap-3 px-4 py-4"
                  key={notice.contest_notice_id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {notice.pinned ? (
                      <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                        상단
                      </span>
                    ) : null}
                    {notice.emergency ? (
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                        긴급
                      </span>
                    ) : null}
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                      {notice.visibility === 'public' ? '공개' : '참가자'}
                    </span>
                    <time className="text-xs font-medium text-slate-400">
                      {formatDateTime(notice.published_at)}
                    </time>
                  </div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        setExpandedNoticeId((current) =>
                          current === notice.contest_notice_id
                            ? ''
                            : notice.contest_notice_id,
                        )
                      }
                      type="button"
                    >
                      <strong className="text-lg font-semibold break-keep text-slate-950">
                        {notice.title}
                      </strong>
                    </button>
                    {canManage ? (
                      <>
                        <button
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          onClick={() => editNotice(notice)}
                          type="button"
                        >
                          수정
                        </button>
                        <button
                          className="h-9 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:text-slate-300"
                          disabled={deleteNoticeMutation.isPending}
                          onClick={() => removeNotice(notice)}
                          type="button"
                        >
                          삭제
                        </button>
                      </>
                    ) : null}
                  </div>
                  {expandedNoticeId === notice.contest_notice_id ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 whitespace-pre-wrap text-slate-700">
                      <NoticeCountdownText
                        text={notice.body}
                        template={notice.body_template}
                        contest={contest}
                      />
                    </p>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="px-4 py-10 text-center text-sm font-medium text-slate-500">
                등록된 공지가 없습니다.
              </p>
            )}
          </div>
          {notices.length > NOTICE_PAGE_SIZE ? (
            <Pagination
              currentPage={noticePage}
              onChange={changeNoticePage}
              totalPages={totalNoticePages}
            />
          ) : null}
          {deleteNoticeMutation.error ? (
            <div className="mt-3">
              <ErrorBox
                error={deleteNoticeMutation.error}
                fallback="공지 삭제에 실패했습니다"
              />
            </div>
          ) : null}
        </OperatorPanel>
      </div>
    </PageLayout>
  );
}

function Pagination({
  currentPage,
  onChange,
  totalPages,
}: {
  currentPage: number;
  onChange: (page: number) => void;
  totalPages: number;
}) {
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {Array.from({ length: totalPages }, (_, index) => index + 1).map(
        (page) => (
          <button
            className={[
              'h-9 min-w-9 rounded-lg border px-3 text-sm font-semibold transition',
              currentPage === page
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
            key={page}
            onClick={() => onChange(page)}
            type="button"
          >
            {page}
          </button>
        ),
      )}
    </nav>
  );
}

function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {error ? formatApiError(error, fallback) : fallback}
    </p>
  );
}
