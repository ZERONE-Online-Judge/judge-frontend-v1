import Select from '@/shared/ui/Select';
import ContestVisibilitySettings from '@/components/operator/ContestVisibilitySettings';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminAccessGate,
  AdminPanel,
  AdminTabs,
  ContestIcon,
} from '@/components/admin/AdminShell';
import PageLayout from '@/components/common/PageLayout';
import {
  assignAdminContestOperator,
  createAdminContest,
  deleteAdminContest,
  getAdminContests,
} from '@/domains/contestAdministration/api';
import { isContestHiddenFromPublic } from '@/domains/contestAdministration/logic';
import type {
  Contest,
  ContestVisibility,
} from '@/domains/contestAdministration/types';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dateTime';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';

type ContestFormState = {
  visibility: ContestVisibility;
  visibility_after_end: ContestVisibility;
  organizationName: string;
  operatorEmail: string;
  operatorDisplayName: string;
  overview: string;
  title: string;
};

type OperatorFormState = {
  contestId: string;
  displayName: string;
  email: string;
};

const emptyContestForm: ContestFormState = {
  visibility: 'public',
  visibility_after_end: 'public',
  organizationName: '',
  operatorEmail: '',
  operatorDisplayName: '',
  overview: '',
  title: '',
};

const emptyOperatorForm: OperatorFormState = {
  contestId: '',
  displayName: '',
  email: '',
};

const statusLabels: Record<string, string> = {
  draft: '초안',
  ended: '종료',
  finalized: '종료',
  open: '예정(공개)',
  running: '진행중',
  schedule_tbd: '초안',
  scheduled: '예정(비공개)',
  archived: '종료',
};

export default function AdminContestsPage() {
  return (
    <AdminAccessGate>
      {(session) => <AdminContestsContent token={session.accessToken} />}
    </AdminAccessGate>
  );
}

function AdminContestsContent({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const queryIdentity = tokenQueryIdentity(token);
  const createContestSectionRef = useRef<HTMLDivElement>(null);
  const [contestForm, setContestForm] = useState(emptyContestForm);
  const [operatorForm, setOperatorForm] = useState(emptyOperatorForm);
  const [contestFormError, setContestFormError] = useState('');
  const [operatorFormError, setOperatorFormError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createdContest, setCreatedContest] = useState<Contest | null>(null);
  const [operatorNotice, setOperatorNotice] = useState('');
  const [deletingContest, setDeletingContest] = useState<Contest | null>(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [deleteNotice, setDeleteNotice] = useState('');

  const contestsQuery = useQuery({
    queryKey: ['admin', 'contests', queryIdentity],
    queryFn: () => getAdminContests(token),
  });

  const contests = useMemo(
    () =>
      [...(contestsQuery.data ?? [])].sort(
        (a, b) =>
          new Date(b.start_at).getTime() - new Date(a.start_at).getTime(),
      ),
    [contestsQuery.data],
  );
  const filteredContests = contests.filter((contest) => {
    const keyword = search.trim().toLowerCase();
    return (
      (!keyword ||
        `${contest.title} ${contest.organization_name}`
          .toLowerCase()
          .includes(keyword)) &&
      (statusFilter === 'all' ||
        (statusLabels[contest.status] ?? contest.status) === statusFilter)
    );
  });

  const createContestMutation = useMutation({
    mutationFn: () =>
      createAdminContest(token, {
        operator_email: contestForm.operatorEmail.trim() || undefined,
        operator_display_name: contestForm.operatorEmail.trim()
          ? contestForm.operatorDisplayName.trim() || undefined
          : undefined,
        organization_name: contestForm.organizationName.trim(),
        overview:
          contestForm.overview.trim() ||
          `${contestForm.organizationName.trim()}에서 주최하는 대회입니다.`,
        status: 'draft',
        visibility: contestForm.visibility,
        visibility_after_end: contestForm.visibility_after_end,
        title: contestForm.title.trim() || undefined,
      }),
    onSuccess: (contest) => {
      setCreatedContest(contest);
      setContestForm(emptyContestForm);
      setContestFormError('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'contests'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });

  const assignOperatorMutation = useMutation({
    mutationFn: () =>
      assignAdminContestOperator(operatorForm.contestId, token, {
        display_name: operatorForm.displayName.trim() || undefined,
        email: operatorForm.email.trim(),
      }),
    onSuccess: (operator) => {
      setOperatorNotice(
        `${operatorForm.email.trim()} 계정을 대회 ${operator.contest_roles?.[operatorForm.contestId]?.includes('owner') ? '총괄' : '마스터'}로 배정했습니다.`,
      );
      setOperatorForm(emptyOperatorForm);
      setOperatorFormError('');
    },
  });

  const deleteContestMutation = useMutation({
    mutationFn: ({ contestId, title }: { contestId: string; title: string }) =>
      deleteAdminContest(contestId, token, title),
    onSuccess: (result) => {
      queryClient.setQueryData<Contest[]>(
        ['admin', 'contests', queryIdentity],
        (previous) =>
          previous?.filter(
            (contest) => contest.contest_id !== result.contest_id,
          ),
      );
      setDeleteNotice(`${result.title} 대회를 삭제했습니다.`);
      setDeletingContest(null);
      setConfirmTitle('');
      if (createdContest?.contest_id === result.contest_id)
        setCreatedContest(null);
      setOperatorForm((previous) =>
        previous.contestId === result.contest_id ? emptyOperatorForm : previous,
      );
      for (const queryKey of [
        ['admin', 'contests'],
        ['admin', 'dashboard'],
        ['operator', 'contests'],
        ['public'],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  function handleCreateContest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createContestMutation.isPending) return;
    setCreatedContest(null);

    if (!contestForm.organizationName.trim()) {
      setContestFormError('주최 기관은 반드시 입력해야 합니다.');
      return;
    }

    setContestFormError('');
    createContestMutation.mutate();
  }

  function handleAssignOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (assignOperatorMutation.isPending) return;
    setOperatorNotice('');

    if (!operatorForm.contestId || !operatorForm.email.trim()) {
      setOperatorFormError('대회와 운영자 이메일을 선택해야 합니다.');
      return;
    }

    setOperatorFormError('');
    assignOperatorMutation.mutate();
  }

  function scrollToCreateContest() {
    createContestSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <PageLayout
      variant="management"
      description="서비스 마스터가 대회를 만들고 모든 권한을 가진 대회 마스터를 배정합니다."
      eyebrow="Service Master"
      title="대회 관리"
      width="full"
    >
      <AdminTabs />
      {deleteNotice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {deleteNotice}
        </p>
      )}

      {contestsQuery.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {formatApiError(
            contestsQuery.error,
            '대회 목록을 불러오지 못했습니다',
          )}
        </div>
      ) : null}

      <div className="grid gap-6">
        <AdminPanel
          actions={
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              onClick={scrollToCreateContest}
              type="button"
            >
              <ContestIcon />
              대회 생성
            </button>
          }
          description="시작 시간이 최근인 대회부터 표시됩니다. 대회명이나 주최 기관으로 검색하고 ‘운영 설정’에서 일정·문제·참가팀을 관리하세요."
          title="대회 목록"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-0 flex-1 gap-2 text-xs font-medium text-slate-600">
              대회 검색
              <input
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                type="search"
                placeholder="대회명 또는 주최 기관"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-xs font-medium text-slate-600">
              대회 상태
              <Select
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">전체 상태</option>
                {[...new Set(Object.values(statusLabels))].map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            {search || statusFilter !== 'all' ? (
              <button
                className="h-11 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
                type="button"
              >
                검색 초기화
              </button>
            ) : null}
            <span className="py-3 text-xs text-slate-500" role="status">
              {filteredContests.length} / {contests.length}개
            </span>
          </div>
          <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="w-72 border-r border-b border-slate-200 px-4 py-3">
                    대회
                  </th>
                  <th className="w-44 border-r border-b border-slate-200 px-4 py-3">
                    주최
                  </th>
                  <th className="w-32 border-r border-b border-slate-200 px-4 py-3">
                    상태
                  </th>
                  <th className="w-40 border-r border-b border-slate-200 px-4 py-3">
                    시작
                  </th>
                  <th className="w-40 border-r border-b border-slate-200 px-4 py-3">
                    종료
                  </th>
                  <th className="w-28 border-b border-slate-200 px-4 py-3">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContests.length > 0 ? (
                  filteredContests.map((contest) => (
                    <ContestRow
                      contest={contest}
                      key={contest.contest_id}
                      onDelete={() => {
                        deleteContestMutation.reset();
                        setConfirmTitle('');
                        setDeletingContest(contest);
                      }}
                    />
                  ))
                ) : (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-sm font-medium text-slate-500"
                      colSpan={6}
                    >
                      {contestsQuery.isLoading
                        ? '대회 목록을 불러오는 중입니다.'
                        : contests.length
                          ? '조건에 맞는 대회가 없습니다. 검색어나 상태 필터를 변경하세요.'
                          : '등록된 대회가 없습니다. 대회 생성 버튼으로 첫 대회를 만들어보세요.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminPanel>

        <AdminPanel
          description="처음 배정하는 계정은 대회 총괄, 이후 배정하는 계정은 대회 마스터가 됩니다. 두 역할 모두 대회의 모든 권한을 가집니다. 총괄 변경은 현재 총괄의 위임으로만 가능합니다."
          title="대회 마스터 배정"
        >
          <form
            className="grid gap-4 lg:grid-cols-3"
            onSubmit={handleAssignOperator}
          >
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              대회
              <Select
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                onChange={(event) =>
                  setOperatorForm((prev) => ({
                    ...prev,
                    contestId: event.target.value,
                  }))
                }
                value={operatorForm.contestId}
              >
                <option value="">대회 선택</option>
                {contests.map((contest) => (
                  <option key={contest.contest_id} value={contest.contest_id}>
                    {contest.title || contest.organization_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              대회 마스터 이메일
              <input
                disabled={
                  !operatorForm.contestId || assignOperatorMutation.isPending
                }
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                onChange={(event) =>
                  setOperatorForm((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
                placeholder="operator@example.com"
                type="email"
                value={operatorForm.email}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              표시 이름 (선택)
              <input
                disabled={
                  !operatorForm.contestId || assignOperatorMutation.isPending
                }
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                onChange={(event) =>
                  setOperatorForm((prev) => ({
                    ...prev,
                    displayName: event.target.value,
                  }))
                }
                placeholder="예: 대회 운영팀"
                value={operatorForm.displayName}
              />
            </label>

            {operatorFormError || assignOperatorMutation.error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 lg:col-span-3">
                {operatorFormError ||
                  formatApiError(
                    assignOperatorMutation.error,
                    '운영자 배정에 실패했습니다',
                  )}
              </p>
            ) : null}

            <div className="flex justify-end lg:col-span-3">
              <button
                className="h-11 rounded-lg border border-amber-200 bg-amber-50 px-5 text-sm font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:text-slate-400"
                disabled={
                  assignOperatorMutation.isPending ||
                  !operatorForm.contestId ||
                  !operatorForm.email.trim()
                }
                type="submit"
              >
                {assignOperatorMutation.isPending
                  ? '배정 중'
                  : '대회 마스터 배정'}
              </button>
            </div>
          </form>
          {operatorNotice ? (
            <p
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            >
              {operatorNotice}
            </p>
          ) : null}
        </AdminPanel>

        <div ref={createContestSectionRef}>
          <AdminPanel
            description="대회는 초안 상태로 생성하고, 이후 운영 페이지에서 일정과 공개 상태를 설정합니다."
            title="대회 생성"
          >
            <form className="grid gap-4" onSubmit={handleCreateContest}>
              <p className="text-sm text-slate-500">
                주최 기관은 필수입니다. 초기 계정은 모든 권한을 가진 대회 총괄로
                등록되며, 나중에 배정할 수도 있습니다.
              </p>
              <ContestVisibilitySettings
                visibility={contestForm.visibility}
                afterEnd={contestForm.visibility_after_end}
                onChange={(field, value) =>
                  setContestForm((prev) => ({ ...prev, [field]: value }))
                }
              />
              <p className="zoj-settings-note">
                상태: 초안 · 생성 후 운영 설정에서 상태와 일정을 변경할 수
                있습니다.
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  대회명
                  <input
                    className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    onChange={(event) =>
                      setContestForm((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }))
                    }
                    placeholder="예: HEPC 1"
                    value={contestForm.title}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  주최 기관 (필수)
                  <input
                    className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    onChange={(event) =>
                      setContestForm((prev) => ({
                        ...prev,
                        organizationName: event.target.value,
                      }))
                    }
                    placeholder="예: COSS"
                    value={contestForm.organizationName}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  초기 대회 총괄 이메일 (선택)
                  <input
                    className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    onChange={(event) =>
                      setContestForm((prev) => ({
                        ...prev,
                        operatorEmail: event.target.value,
                      }))
                    }
                    placeholder="operator@example.com"
                    type="email"
                    value={contestForm.operatorEmail}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  초기 총괄 표시 이름
                  <input
                    className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    maxLength={120}
                    placeholder="예: 손동열"
                    onChange={(event) =>
                      setContestForm((prev) => ({
                        ...prev,
                        operatorDisplayName: event.target.value,
                      }))
                    }
                    value={contestForm.operatorDisplayName}
                  />
                  <span className="text-xs font-normal text-slate-500">
                    이메일과 함께 입력하세요. 비워 두면 이메일을 표시합니다.
                  </span>
                </label>
              </div>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                개요
                <textarea
                  className="min-h-28 resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6 font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  onChange={(event) =>
                    setContestForm((prev) => ({
                      ...prev,
                      overview: event.target.value,
                    }))
                  }
                  placeholder="대회 소개를 입력하세요."
                  value={contestForm.overview}
                />
              </label>

              {contestFormError || createContestMutation.error ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {contestFormError ||
                    formatApiError(
                      createContestMutation.error,
                      '대회 생성에 실패했습니다',
                    )}
                </p>
              ) : null}

              <div className="flex justify-end">
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:bg-slate-300"
                  disabled={createContestMutation.isPending}
                  type="submit"
                >
                  <ContestIcon />
                  {createContestMutation.isPending ? '생성 중' : '대회 생성'}
                </button>
              </div>
            </form>
            {createdContest ? (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              >
                <span>
                  {createdContest.title} 대회를 초안으로 생성했습니다. 다음으로
                  일정과 참가 유형을 설정하세요.
                </span>
                <Link
                  className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-medium"
                  to={`/operator/contests/${createdContest.contest_id}/settings`}
                >
                  운영 설정으로 이동
                </Link>
              </div>
            ) : null}
          </AdminPanel>
        </div>
      </div>
      {deletingContest && (
        <ModalDialog
          title="대회 삭제"
          size="md"
          closeOnBackdrop={false}
          onClose={
            deleteContestMutation.isPending
              ? undefined
              : () => setDeletingContest(null)
          }
          description="삭제할 대회와 영향을 확인해 주세요."
          footer={
            <>
              <ModalButton
                disabled={deleteContestMutation.isPending}
                onClick={() => setDeletingContest(null)}
              >
                취소
              </ModalButton>
              <ModalButton
                tone="danger"
                disabled={
                  deleteContestMutation.isPending ||
                  confirmTitle.trim() !== deletingContest.title.trim()
                }
                onClick={() =>
                  deleteContestMutation.mutate({
                    contestId: deletingContest.contest_id,
                    title: confirmTitle,
                  })
                }
              >
                {deleteContestMutation.isPending ? '삭제 중…' : '대회 삭제'}
              </ModalButton>
            </>
          }
        >
          <div className="grid gap-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
              <strong className="block">{deletingContest.title}</strong>
              삭제하면 서비스 마스터·운영자·참가자 목록에서 사라지고, 기존
              주소로도 접속할 수 없습니다.
            </div>
            <p className="text-sm leading-6 text-slate-600">
              참가자 접속이 해제되고 대기 중인 대회 메일은 취소됩니다.
              문제·제출·참가 정보와 운영 기록은 서버에 보관합니다. 진행 중인
              대회나 채점이 남아 있는 대회는 삭제할 수 없습니다.
            </p>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              대회명 확인
              <span className="text-xs font-normal text-slate-500">
                아래에 ‘{deletingContest.title}’을 입력하세요.
              </span>
              <input
                aria-label="삭제할 대회명"
                className="h-11 rounded-lg border border-slate-200 px-3 font-normal outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                value={confirmTitle}
                onChange={(event) => setConfirmTitle(event.target.value)}
                disabled={deleteContestMutation.isPending}
                autoComplete="off"
              />
            </label>
            {deleteContestMutation.error && (
              <p role="alert" className="text-sm text-rose-700">
                {formatApiError(
                  deleteContestMutation.error,
                  '대회 삭제에 실패했습니다',
                )}
              </p>
            )}
          </div>
        </ModalDialog>
      )}
    </PageLayout>
  );
}

function ContestRow({
  contest,
  onDelete,
}: {
  contest: Contest;
  onDelete: () => void;
}) {
  return (
    <tr className="transition hover:bg-indigo-50/40">
      <td className="border-r border-slate-100 px-4 py-4 align-top">
        <div className="grid min-w-0 gap-1">
          <strong
            className="zoj-truncate-safe max-w-full font-semibold text-slate-950"
            title={contest.title || '-'}
          >
            {contest.title || '-'}
          </strong>
          <span
            className="zoj-truncate-safe max-w-full text-xs font-medium text-slate-400"
            title={contest.contest_id}
          >
            {contest.contest_id}
          </span>
        </div>
      </td>
      <td
        className="zoj-break-anywhere border-r border-slate-100 px-4 py-4 align-top font-medium text-slate-700"
        title={contest.organization_name || '-'}
      >
        {contest.organization_name || '-'}
      </td>
      <td className="border-r border-slate-100 px-4 py-4 align-top">
        <span className="inline-flex max-w-full flex-wrap rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
          {statusLabels[contest.status] ?? contest.status}
          {isContestHiddenFromPublic(contest) ? (
            <span className="ml-1 text-indigo-400">운영자만 표시</span>
          ) : null}
        </span>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          대회 {contest.visibility === 'private' ? '비공개' : '공개'} · 종료 후{' '}
          {contest.visibility_after_end === 'private' ? '비공개' : '공개'}
        </p>
      </td>
      <td className="border-r border-slate-100 px-4 py-4 align-top font-medium text-slate-600">
        {formatDateTime(contest.start_at)}
      </td>
      <td className="border-r border-slate-100 px-4 py-4 align-top font-medium text-slate-600">
        {formatDateTime(contest.end_at)}
      </td>
      <td className="px-4 py-4 align-top">
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold whitespace-nowrap text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            to={`/operator/contests/${contest.contest_id}/settings`}
          >
            운영 설정
          </Link>
          <button
            type="button"
            aria-label={`${contest.title} 삭제`}
            onClick={onDelete}
            disabled={contest.status === 'running'}
            title={
              contest.status === 'running'
                ? '진행 중인 대회는 종료 후 삭제할 수 있습니다.'
                : undefined
            }
            className="inline-flex rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold whitespace-nowrap text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          >
            삭제
          </button>
        </div>
      </td>
    </tr>
  );
}
