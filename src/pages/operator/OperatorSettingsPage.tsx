import InterfaceIcon from '@/components/common/InterfaceIcon';
import ProblemLanguageSettings from '@/components/operator/ProblemLanguageSettings';
import RecentChangeNotice from '@/components/operator/RecentChangeNotice';
import SettingsSaveBar from '@/components/operator/SettingsSaveBar';
import './OperatorSettingsPage.css';
import useConfirmation from '@/shared/ui/useConfirmation';
import ContestVisibilitySettings from '@/components/operator/ContestVisibilitySettings';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import { ChoiceCard } from '@/components/common/ManagementCards';
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
import {
  contestResourceAccess,
  contestStatusLabel,
  isContestOperationLocked,
  isScheduleTbd,
} from '@/domains/contestAdministration/logic';
import type {
  Contest,
  ContestVisibility,
  ContestSettingsPatch,
  ContestResourceAccess,
  ScoreboardReleaseMode,
} from '@/domains/contestAdministration/types';
import { SCOREBOARD_RELEASE_OPTIONS } from '@/domains/submissionScoreboard/releaseModes';
import { notifyScoreboardUpdate } from '@/domains/submissionScoreboard/presentationSync';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { hasContestPermission } from '@/domains/identityAccess/permissions';
import type { StaffSession } from '@/domains/identityAccess/types';
import { formatApiError } from '@/shared/api/errors';
import { dateTimeLocalToIso, dateTimeLocalValue } from '@/shared/lib/dateTime';

type SettingsForm = {
  visibility: ContestVisibility;
  visibility_after_end: ContestVisibility;
  end_at: string;
  freeze_at: string;
  organization_name: string;
  overview: string;
  problem_access_after_end: ContestResourceAccess;
  scoreboard_access_after_end: ContestResourceAccess;
  scoreboard_release_mode: ScoreboardReleaseMode;
  start_at: string;
  status: string;
  submission_access_after_end: ContestResourceAccess;
  board_access_after_end: ContestResourceAccess;
  board_write_after_end: boolean;
  editorial_access_after_end: ContestResourceAccess;
  notice_access_after_end: ContestResourceAccess;
  mock_judging_enabled: boolean;
  participant_progress_visible: boolean;
  mock_judging_progress_visible: boolean;
  title: string;
};

type SettingsDraft = {
  contestId: string;
  form: SettingsForm;
};

const statusOptions = [
  ['draft', '초안'],
  ['scheduled', '예정(비공개)'],
  ['open', '예정(공개)'],
  ['running', '진행중'],
  ['ended', '종료'],
] as const;

const accessOptions: { label: string; value: ContestResourceAccess }[] = [
  { label: '비공개', value: 'private' },
  { label: '참가자 공개 유지', value: 'participants' },
  { label: '비로그인 공개', value: 'public' },
];

function normalizeVisibility(form: SettingsForm): SettingsForm {
  const next = { ...form };
  if (next.visibility_after_end === 'private') {
    for (const field of [
      'problem_access_after_end',
      'scoreboard_access_after_end',
      'submission_access_after_end',
      'board_access_after_end',
      'notice_access_after_end',
      'editorial_access_after_end',
    ] as const) {
      if (next[field] === 'public') next[field] = 'participants';
    }
  }
  return next;
}

function settingsFormFromContest(contest: Contest): SettingsForm {
  const status = contest.status === 'schedule_tbd' ? 'draft' : contest.status;

  return normalizeVisibility({
    visibility: contest.visibility ?? 'public',
    visibility_after_end: contest.visibility_after_end ?? 'public',
    end_at: dateTimeLocalValue(contest.end_at),
    freeze_at: dateTimeLocalValue(contest.freeze_at),
    organization_name: contest.organization_name,
    overview: contest.overview,
    problem_access_after_end: contestResourceAccess(contest, 'problem'),
    scoreboard_access_after_end: contestResourceAccess(contest, 'scoreboard'),
    scoreboard_release_mode: contest.scoreboard_release_mode ?? 'manual',
    start_at: dateTimeLocalValue(contest.start_at),
    status,
    submission_access_after_end: contestResourceAccess(contest, 'submission'),
    board_access_after_end: contestResourceAccess(contest, 'board'),
    board_write_after_end: Boolean(contest.board_write_after_end),
    editorial_access_after_end:
      contestResourceAccess(contest, 'problem') === 'private'
        ? 'private'
        : contestResourceAccess(contest, 'editorial'),
    notice_access_after_end: contestResourceAccess(contest, 'notice'),
    mock_judging_enabled:
      contestResourceAccess(contest, 'problem') === 'private'
        ? false
        : Boolean(contest.mock_judging_enabled),
    participant_progress_visible: contest.participant_progress_visible ?? true,
    mock_judging_progress_visible: Boolean(
      contest.mock_judging_progress_visible,
    ),
    title: contest.title,
  });
}

export default function OperatorSettingsPage() {
  const { contestId } = useParams();

  return (
    <OperatorAccessGate
      contestId={contestId}
      permission="contest.settings.manage"
    >
      {(session) =>
        contestId ? (
          <OperatorSettingsContent
            contestId={contestId}
            key={`${contestId}:${session.staff.email}`}
            session={session}
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

function OperatorSettingsContent({
  contestId,
  session,
}: {
  contestId: string;
  session: StaffSession;
}) {
  const token = session.accessToken;
  const canManageSettings = hasContestPermission(
    session,
    contestId,
    'contest.settings.manage',
  );
  const queryClient = useQueryClient();
  const queryIdentity = tokenQueryIdentity(token);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(
    null,
  );
  const [formError, setFormError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const { confirm, dialog } = useConfirmation();

  const dashboardQuery = useQuery({
    queryKey: ['operator', 'dashboard', contestId, queryIdentity],
    queryFn: () => getOperatorContestDashboard(contestId, token),
  });

  const contest = dashboardQuery.data?.contest;
  const settingsForm =
    settingsDraft?.contestId === contestId
      ? settingsDraft.form
      : contest
        ? settingsFormFromContest(contest)
        : null;
  const operationLocked = contest ? isContestOperationLocked(contest) : false;

  const scheduleDisabled = !settingsForm || isScheduleTbd(settingsForm.status);
  const quickActionsVisible = Boolean(
    settingsForm &&
    ['open', 'running', 'ended', 'finalized', 'archived'].includes(
      settingsForm.status,
    ),
  );

  function setSettingsForm(
    updater: (prev: SettingsForm | null) => SettingsForm | null,
  ) {
    setSavedMessage('');
    setFormError('');
    const next = updater(settingsForm);
    setSettingsDraft(
      next ? { contestId, form: normalizeVisibility(next) } : null,
    );
  }

  function settingsPatchFromForm(form: SettingsForm): ContestSettingsPatch {
    const body: ContestSettingsPatch = {
      visibility: form.visibility,
      visibility_after_end: form.visibility_after_end,
      problem_access_after_end: form.problem_access_after_end,
      scoreboard_access_after_end: form.scoreboard_access_after_end,
      scoreboard_release_mode: form.scoreboard_release_mode,
      submission_access_after_end: form.submission_access_after_end,
      board_access_after_end: form.board_access_after_end,
      board_write_after_end: form.board_write_after_end,
      editorial_access_after_end:
        form.problem_access_after_end === 'private'
          ? 'private'
          : form.editorial_access_after_end,
      notice_access_after_end: form.notice_access_after_end,
      mock_judging_enabled:
        form.problem_access_after_end === 'private'
          ? false
          : form.mock_judging_enabled,
      participant_progress_visible: form.participant_progress_visible,
      mock_judging_progress_visible: form.participant_progress_visible
        ? false
        : form.mock_judging_progress_visible,
    };

    if (!isScheduleTbd(form.status)) {
      body.start_at = dateTimeLocalToIso(form.start_at);
      body.freeze_at = dateTimeLocalToIso(form.freeze_at);
      body.end_at = dateTimeLocalToIso(form.end_at);
    }

    if (!operationLocked) {
      body.organization_name = form.organization_name.trim();
      body.overview = form.overview.trim();
      body.status = form.status;
      body.title = form.title.trim();
    }

    return body;
  }

  function changedSettingsPatch(form: SettingsForm): ContestSettingsPatch {
    const next = settingsPatchFromForm(form);
    const previous = contest
      ? settingsPatchFromForm(settingsFormFromContest(contest))
      : {};
    return Object.fromEntries(
      Object.entries(next).filter(
        ([key, value]) => value !== previous[key as keyof ContestSettingsPatch],
      ),
    ) as ContestSettingsPatch;
  }
  const changedCount = settingsForm
    ? Object.keys(changedSettingsPatch(settingsForm)).length
    : 0;

  const updateSettingsMutation = useMutation({
    mutationFn: (body?: ContestSettingsPatch) =>
      updateContestSettings(
        contestId,
        token,
        body ?? changedSettingsPatch(settingsForm!),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        ['operator', 'dashboard', contestId, queryIdentity],
        (previous: typeof dashboardQuery.data) =>
          previous ? { ...previous, contest: updated } : previous,
      );
      setSettingsDraft(null);
      setFormError('');
      setSavedMessage('설정이 저장되었습니다.');
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'dashboard', contestId],
      });
      notifyScoreboardUpdate(contestId);
    },
  });

  function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settingsForm?.title.trim() || !settingsForm.organization_name.trim()) {
      setFormError(
        '대회명과 주최 기관을 입력해야 합니다. 기본 정보에서 확인해 주세요.',
      );
      return;
    }

    if (!changedCount || updateSettingsMutation.isPending) return;
    setSavedMessage('');
    updateSettingsMutation.mutate(undefined);
  }

  function updateDate(name: 'start_at' | 'end_at' | 'freeze_at', date: Date) {
    setSettingsForm((prev) =>
      prev ? { ...prev, [name]: dateTimeLocalValue(date.toISOString()) } : prev,
    );
  }

  function applyQuickAction(
    action:
      | 'start-now'
      | 'end-10'
      | 'end-30'
      | 'freeze-now'
      | 'freeze-30'
      | 'freeze-60',
  ) {
    if (!quickActionsVisible || updateSettingsMutation.isPending) return;
    const now = new Date();
    const addMinutes = (minutes: number) =>
      new Date(now.getTime() + minutes * 60_000);

    if (action === 'start-now') {
      setSettingsForm((prev) =>
        prev
          ? {
              ...prev,
              start_at: dateTimeLocalValue(now.toISOString()),
              status: 'running',
            }
          : prev,
      );
      return;
    }

    if (action === 'end-10') updateDate('end_at', addMinutes(10));
    if (action === 'end-30') updateDate('end_at', addMinutes(30));
    if (action === 'freeze-now') updateDate('freeze_at', now);
    if (action === 'freeze-30') updateDate('freeze_at', addMinutes(30));
    if (action === 'freeze-60') updateDate('freeze_at', addMinutes(60));
  }

  return (
    <PageLayout
      variant="management"
      description="대회 정보, 일정과 공개 범위를 조정합니다."
      eyebrow="Operator"
      title={`${contest?.title ?? '대회'} 설정`}
      width="full"
    >
      {dialog}
      <OperatorTabs contestId={contestId} />
      <RecentChangeNotice contestId={contestId} token={token} />

      {dashboardQuery.error ? (
        <ErrorBox
          error={dashboardQuery.error}
          fallback="설정 데이터를 불러오지 못했습니다"
        />
      ) : null}

      {canManageSettings ? (
        <div className="grid min-w-0 gap-6">
          <OperatorPanel
            description="대회 기본 정보와 공개 정책을 수정합니다."
            title="대회 설정"
          >
            {settingsForm ? (
              <form
                className="operator-settings-form"
                onSubmit={handleSettingsSubmit}
              >
                <p className="text-sm leading-6 text-slate-600">
                  필요한 항목을 펼쳐 수정하세요. 변경한 값만 저장되며, 화면
                  아래에서 언제든 저장할 수 있습니다.
                </p>
                <fieldset
                  disabled={updateSettingsMutation.isPending}
                  className="grid min-w-0 gap-3"
                >
                  {operationLocked ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                      대회가 진행 중이어서 기본 정보와 상태 변경은 잠겨
                      있습니다. 일정, 공개 범위와 채점 진행률 설정은 계속 조정할
                      수 있습니다.
                    </p>
                  ) : null}
                  <SettingsSection
                    title="기본 정보"
                    summary={`${contestStatusLabel(settingsForm.status)} · ${settingsForm.title || '대회명 미입력'}`}
                    defaultOpen
                    description="대회 목록과 소개 화면에 표시할 정보를 입력합니다."
                    hint={
                      operationLocked
                        ? '진행 중인 대회의 기본 정보와 상태는 변경할 수 없습니다.'
                        : '‘예정(비공개)’는 운영자만 확인하는 준비 단계입니다. 참가자에게 보이게 하려면 ‘예정(공개)’로 변경하세요.'
                    }
                  >
                    <div className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)]">
                      <label className="grid gap-2 text-sm font-semibold text-slate-700">
                        상태
                        <select
                          className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
                          disabled={operationLocked}
                          onChange={(event) =>
                            setSettingsForm((prev) =>
                              prev
                                ? { ...prev, status: event.target.value }
                                : prev,
                            )
                          }
                          value={settingsForm.status}
                        >
                          {statusOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <TextInput
                        disabled={operationLocked}
                        label="대회명"
                        onChange={(value) =>
                          setSettingsForm((prev) =>
                            prev ? { ...prev, title: value } : prev,
                          )
                        }
                        value={settingsForm.title}
                      />
                      <TextInput
                        disabled={operationLocked}
                        label="주최 기관"
                        onChange={(value) =>
                          setSettingsForm((prev) =>
                            prev ? { ...prev, organization_name: value } : prev,
                          )
                        }
                        value={settingsForm.organization_name}
                      />
                    </div>
                    <label className="grid gap-2 text-sm font-semibold text-slate-700">
                      개요
                      <textarea
                        className="min-h-20 resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6 font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
                        disabled={operationLocked}
                        onChange={(event) =>
                          setSettingsForm((prev) =>
                            prev
                              ? { ...prev, overview: event.target.value }
                              : prev,
                          )
                        }
                        value={settingsForm.overview}
                      />
                    </label>
                  </SettingsSection>
                  <SettingsSection
                    title="대회 일정"
                    summary={
                      scheduleDisabled
                        ? '초안 · 일정 미설정'
                        : `${settingsForm.start_at.replace('T', ' ')} ~ ${settingsForm.end_at.replace('T', ' ')}`
                    }
                    disabled={
                      scheduleDisabled || updateSettingsMutation.isPending
                    }
                    description={
                      scheduleDisabled
                        ? '초안에서는 일정 입력이 잠깁니다. 기본 정보에서 예정 상태로 변경하세요.'
                        : `시작·프리즈·종료 시간을 설정합니다. 시간대: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
                    }
                    hint="변경한 일정은 화면 아래 ‘변경사항 저장’을 누르면 반영됩니다."
                  >
                    <div className="zoj-settings-fields">
                      <DateInput
                        label="시작"
                        name="start_at"
                        setForm={setSettingsForm}
                        value={settingsForm.start_at}
                      />
                      <DateInput
                        label="프리즈"
                        name="freeze_at"
                        setForm={setSettingsForm}
                        value={settingsForm.freeze_at}
                      />
                      <DateInput
                        label="종료"
                        name="end_at"
                        setForm={setSettingsForm}
                        value={settingsForm.end_at}
                      />
                    </div>
                  </SettingsSection>
                  {quickActionsVisible ? (
                    <QuickActions
                      currentStatus={settingsForm.status}
                      disabled={updateSettingsMutation.isPending}
                      onAction={applyQuickAction}
                    />
                  ) : null}
                  <SettingsSection
                    title="대회 공개"
                    summary={`대회 ${settingsForm.visibility === 'public' ? '공개' : '비공개'} · 종료 후 ${settingsForm.visibility_after_end === 'public' ? '공개' : '비공개'}`}
                  >
                    <ContestVisibilitySettings
                      visibility={settingsForm.visibility}
                      afterEnd={settingsForm.visibility_after_end}
                      onChange={(field, value) =>
                        setSettingsForm((prev) =>
                          prev ? { ...prev, [field]: value } : prev,
                        )
                      }
                    />
                  </SettingsSection>
                  <SettingsSection
                    title="종료 후 순위 공개 방식"
                    summary={
                      SCOREBOARD_RELEASE_OPTIONS.find(
                        (option) =>
                          option.value === settingsForm.scoreboard_release_mode,
                      )?.label
                    }
                    description="참가자 스코어보드와 프레젠테이션에 같은 방식이 적용됩니다. 발표 조작은 운영자 스코어보드 탭에서 합니다."
                    disabled={Boolean(contest?.scoreboard_release_locked)}
                    hint="누가 볼 수 있는지는 아래 ‘자료 공개 범위 → 스코어보드’에서 별도로 정합니다. 순위를 공개해도 열람 범위가 비공개이면 참가자는 볼 수 없습니다."
                  >
                    {SCOREBOARD_RELEASE_OPTIONS.map((option) => (
                      <ChoiceCard
                        key={option.value}
                        checked={
                          settingsForm.scoreboard_release_mode === option.value
                        }
                        name="scoreboard_release_mode"
                        value={option.value}
                        title={option.label}
                        description={option.description}
                        hint={option.flow.join(' → ')}
                        onChange={() =>
                          setSettingsForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  scoreboard_release_mode: option.value,
                                }
                              : prev,
                          )
                        }
                      />
                    ))}
                    <p className="zoj-settings-card__description">
                      {contest?.scoreboard_release_locked
                        ? '이미 순위 공개를 시작한 유형이 있어 공개 방식을 변경할 수 없습니다.'
                        : '순위별·결과 순차 공개는 발표 시작 시 성적을 고정하며, 이후에는 방식을 변경할 수 없습니다.'}
                    </p>
                  </SettingsSection>
                  <SettingsSection
                    title="자료 공개 범위"
                    summary={`문제집 ${accessOptions.find((option) => option.value === settingsForm.problem_access_after_end)?.label} · 스코어보드 ${accessOptions.find((option) => option.value === settingsForm.scoreboard_access_after_end)?.label}`}
                    description={
                      settingsForm.visibility_after_end === 'private'
                        ? '종료 후 비공개 대회입니다. 각 자료를 참가자에게 공개하거나 운영자만 볼 수 있게 설정하세요.'
                        : '종료 후 각 자료를 누가 볼 수 있는지 선택하세요. 대회가 공개인 동안 문제집·스코어보드·채점현황의 비로그인 공개가 적용됩니다. 해설은 종료 후에만 공개됩니다.'
                    }
                    hint="문제집을 비공개로 바꾸면 해설도 비공개로 바뀌고 모의채점이 꺼집니다. 게시판 작성 허용은 아래에서 별도로 설정합니다."
                  >
                    <dl className="grid gap-3 text-xs leading-5 sm:grid-cols-3">
                      <div className="zoj-settings-note">
                        <dt className="font-semibold text-slate-700">비공개</dt>
                        <dd className="mt-1">
                          종료 후 참가자와 방문자가 볼 수 없습니다.
                        </dd>
                      </div>
                      <div className="zoj-settings-note">
                        <dt className="font-semibold text-slate-700">
                          참가자 공개 유지
                        </dt>
                        <dd className="mt-1">
                          해당 대회 참가자로 로그인하면 볼 수 있습니다.
                        </dd>
                      </div>
                      {settingsForm.visibility_after_end === 'public' ? (
                        <div className="zoj-settings-note">
                          <dt className="font-semibold text-slate-700">
                            비로그인 공개
                          </dt>
                          <dd className="mt-1">
                            로그인하지 않은 방문자도 볼 수 있습니다.
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="zoj-settings-resources">
                      <AccessSelect
                        allowPublic={
                          settingsForm.visibility_after_end === 'public'
                        }
                        helperText="문제 목록과 문제 본문의 공개 범위입니다. 비공개로 바꾸면 해설도 비공개로 바뀌고 모의채점이 꺼집니다."
                        label="문제집"
                        onChange={(value) =>
                          setSettingsForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  problem_access_after_end: value,
                                  editorial_access_after_end:
                                    value === 'private'
                                      ? 'private'
                                      : prev.editorial_access_after_end,
                                  mock_judging_enabled:
                                    value === 'private'
                                      ? false
                                      : prev.mock_judging_enabled,
                                }
                              : prev,
                          )
                        }
                        value={settingsForm.problem_access_after_end}
                      />
                      <AccessSelect
                        allowPublic={
                          settingsForm.visibility_after_end === 'public'
                        }
                        label="스코어보드"
                        helperText="순위와 팀별 성적을 누가 볼 수 있는지 정합니다. 위에서 선택한 종료 후 순위 공개 방식과 별도로 적용됩니다."
                        onChange={(value) =>
                          setSettingsForm((prev) =>
                            prev
                              ? { ...prev, scoreboard_access_after_end: value }
                              : prev,
                          )
                        }
                        value={settingsForm.scoreboard_access_after_end}
                      />
                      <AccessSelect
                        allowPublic={
                          settingsForm.visibility_after_end === 'public'
                        }
                        label="채점현황"
                        helperText="제출 목록과 채점 결과의 열람 범위입니다. 제출 소스 코드의 열람 권한과는 별개입니다."
                        onChange={(value) =>
                          setSettingsForm((prev) =>
                            prev
                              ? { ...prev, submission_access_after_end: value }
                              : prev,
                          )
                        }
                        value={settingsForm.submission_access_after_end}
                      />
                      <AccessSelect
                        allowPublic={
                          settingsForm.visibility_after_end === 'public'
                        }
                        label="게시판"
                        helperText="종료 후 게시판을 열람할 수 있는 대상입니다. 글을 쓰게 하려면 아래 ‘게시판 작성 허용’도 켜세요."
                        onChange={(value) =>
                          setSettingsForm((prev) =>
                            prev
                              ? { ...prev, board_access_after_end: value }
                              : prev,
                          )
                        }
                        value={settingsForm.board_access_after_end}
                      />
                      <AccessSelect
                        allowPublic={
                          settingsForm.visibility_after_end === 'public'
                        }
                        disabled={
                          settingsForm.problem_access_after_end === 'private'
                        }
                        helperText={
                          settingsForm.problem_access_after_end === 'private'
                            ? '문제집 종료 후 공개가 켜져야 해설 공개 범위를 설정할 수 있습니다.'
                            : '해설은 대회 종료 후에만 공개됩니다.'
                        }
                        label="해설"
                        onChange={(value) =>
                          setSettingsForm((prev) =>
                            prev
                              ? { ...prev, editorial_access_after_end: value }
                              : prev,
                          )
                        }
                        value={settingsForm.editorial_access_after_end}
                      />
                      <AccessSelect
                        allowPublic={
                          settingsForm.visibility_after_end === 'public'
                        }
                        label="공지"
                        helperText="대회 종료 후 공지사항을 열람할 수 있는 대상입니다."
                        onChange={(value) =>
                          setSettingsForm((prev) =>
                            prev
                              ? { ...prev, notice_access_after_end: value }
                              : prev,
                          )
                        }
                        value={settingsForm.notice_access_after_end}
                      />
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    title="참가자 채점 진행률"
                    summary={
                      settingsForm.participant_progress_visible
                        ? '진행률 보이기'
                        : settingsForm.mock_judging_progress_visible
                          ? '정규 제출 가리기 · 모의채점 보이기'
                          : '진행률 가리기'
                    }
                    description="참가자에게 채점 과정을 얼마나 보여줄지 선택합니다. 최종 채점 결과는 항상 표시되며, 스코어보드 프리즈와는 별도로 적용됩니다."
                  >
                    <div className="zoj-settings-fields">
                      <ChoiceCard
                        checked={settingsForm.participant_progress_visible}
                        name="participant_progress_visible"
                        value="visible"
                        title="보이기"
                        description="테스트케이스 진행률과 채점 대기 정보를 표시합니다."
                        onChange={() =>
                          setSettingsForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  participant_progress_visible: true,
                                  mock_judging_progress_visible: false,
                                }
                              : prev,
                          )
                        }
                      />
                      <ChoiceCard
                        checked={!settingsForm.participant_progress_visible}
                        name="participant_progress_visible"
                        value="hidden"
                        title="가리기"
                        description="진행률과 대기 순번을 가리고, 채점 경과 시간만 표시합니다."
                        onChange={() =>
                          setSettingsForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  participant_progress_visible: false,
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                    {!settingsForm.participant_progress_visible ? (
                      <ChoiceCard
                        checked={settingsForm.mock_judging_progress_visible}
                        type="checkbox"
                        title="모의채점 진행률 보이기"
                        description="정규 제출의 진행률은 가린 채 모의채점 진행률만 보여줍니다. 꺼두면 모의채점도 경과 시간만 표시합니다."
                        onChange={(checked) =>
                          setSettingsForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  mock_judging_progress_visible: checked,
                                }
                              : prev,
                          )
                        }
                      />
                    ) : null}
                  </SettingsSection>
                  <SettingsSection
                    title="종료 후 참여"
                    summary={`게시판 작성 ${settingsForm.board_write_after_end ? '허용' : '차단'} · 모의채점 ${settingsForm.mock_judging_enabled ? '사용' : '사용 안 함'}`}
                    description="대회가 끝난 뒤에도 질문을 주고받거나 문제를 연습할 수 있도록 설정합니다."
                  >
                    <ChoiceCard
                      checked={settingsForm.board_write_after_end}
                      type="checkbox"
                      title="대회 종료 후 게시판 작성 허용"
                      description="참가자가 질문과 댓글을 작성할 수 있습니다. 게시판 공개 범위가 비공개이면 작성도 차단됩니다."
                      onChange={(checked) =>
                        setSettingsForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                board_write_after_end: checked,
                              }
                            : prev,
                        )
                      }
                    />
                    <ChoiceCard
                      checked={settingsForm.mock_judging_enabled}
                      disabled={
                        settingsForm.problem_access_after_end === 'private'
                      }
                      type="checkbox"
                      title="모의채점"
                      description="문제집을 볼 수 있는 사용자가 연습 제출로 채점 결과를 확인합니다. 일반 채점현황과 스코어보드에는 기록하지 않습니다."
                      hint={
                        settingsForm.problem_access_after_end === 'private'
                          ? '문제집을 참가자 또는 비로그인 공개로 바꾸면 사용할 수 있습니다.'
                          : '모의채점 결과는 대회 순위에 반영되지 않습니다.'
                      }
                      onChange={(checked) =>
                        setSettingsForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                mock_judging_enabled: checked,
                              }
                            : prev,
                        )
                      }
                    />
                  </SettingsSection>
                </fieldset>
                <SettingsSaveBar
                  changedCount={changedCount}
                  pending={updateSettingsMutation.isPending}
                  savedMessage={savedMessage}
                  error={
                    formError ||
                    (updateSettingsMutation.error
                      ? formatApiError(
                          updateSettingsMutation.error,
                          '저장에 실패했습니다. 다시 시도해 주세요.',
                        )
                      : '')
                  }
                  onReset={async () => {
                    if (
                      await confirm(
                        '아직 저장하지 않은 변경사항을 모두 되돌릴까요?',
                        {
                          title: '설정 변경 취소',
                          confirmLabel: '되돌리기',
                        },
                      )
                    ) {
                      setSettingsDraft(null);
                      setFormError('');
                      setSavedMessage('');
                      updateSettingsMutation.reset();
                    }
                  }}
                />
              </form>
            ) : (
              <p className="text-sm font-medium text-slate-600">
                대회 설정을 불러오는 중입니다.
              </p>
            )}
          </OperatorPanel>
          {hasContestPermission(
            session,
            contestId,
            'contest.problem.manage',
          ) ? (
            <ProblemLanguageSettings contestId={contestId} token={token} />
          ) : null}
        </div>
      ) : null}
    </PageLayout>
  );
}

function TextInput({
  disabled,
  helperText,
  label,
  onChange,
  required,
  type = 'text',
  value,
}: {
  disabled?: boolean;
  helperText?: string;
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: 'text' | 'email';
  value: string;
}) {
  const helpId = useId();
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        aria-describedby={helperText ? helpId : undefined}
        className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
      {helperText ? (
        <span
          id={helpId}
          className="text-xs leading-5 font-normal text-slate-600"
        >
          {helperText}
        </span>
      ) : null}
    </label>
  );
}

function DateInput({
  label,
  name,
  setForm,
  value,
}: {
  label: string;
  name: 'start_at' | 'end_at' | 'freeze_at';
  setForm: (
    updater: (prev: SettingsForm | null) => SettingsForm | null,
  ) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        className="h-11 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        onChange={(event) =>
          setForm((prev) =>
            prev ? { ...prev, [name]: event.target.value } : prev,
          )
        }
        type="datetime-local"
        value={value}
      />
    </label>
  );
}

function AccessSelect({
  allowPublic,
  disabled,
  helperText,
  label,
  onChange,
  value,
}: {
  allowPublic: boolean;
  disabled?: boolean;
  helperText?: string;
  label: string;
  onChange: (value: ContestResourceAccess) => void;
  value: ContestResourceAccess;
}) {
  const helpId = useId();
  return (
    <label className="zoj-settings-access">
      {label}
      <select
        aria-describedby={helperText ? helpId : undefined}
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-100 disabled:text-slate-400"
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value as ContestResourceAccess)
        }
        value={value}
      >
        {accessOptions
          .filter((option) => allowPublic || option.value !== 'public')
          .map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </select>
      {helperText ? (
        <span
          id={helpId}
          className="text-xs leading-5 font-normal text-slate-600"
        >
          {helperText}
        </span>
      ) : null}
    </label>
  );
}

function QuickActions({
  currentStatus,
  disabled,
  onAction,
}: {
  currentStatus: string;
  disabled: boolean;
  onAction: (
    action:
      | 'start-now'
      | 'end-10'
      | 'end-30'
      | 'freeze-now'
      | 'freeze-30'
      | 'freeze-60',
  ) => void;
}) {
  const actions = [
    ['start-now', '지금 시작'],
    ['end-10', '지금부터 10분 뒤 종료'],
    ['end-30', '지금부터 30분 뒤 종료'],
    ['freeze-now', '지금 프리즈'],
    ['freeze-30', '지금부터 30분 뒤 프리즈'],
    ['freeze-60', '지금부터 60분 뒤 프리즈'],
  ] as const;

  return (
    <SettingsSection
      title="빠른 일정 변경"
      summary="지금 시작 · 종료 연장 · 프리즈 시간 조정"
      description="현재 시각을 기준으로 시작·프리즈·종료 시간을 빠르게 입력합니다."
      hint="버튼은 입력값만 바꿉니다. 화면 아래 ‘변경사항 저장’을 눌러야 실제 일정에 반영됩니다."
    >
      <span className="w-fit rounded-lg border border-indigo-100 bg-white px-3 py-1 text-xs font-medium text-indigo-700">
        선택한 상태: {contestStatusLabel(currentStatus)}
      </span>
      <div className="flex flex-wrap gap-2">
        {actions.map(([action, label]) => (
          <button
            className="h-9 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
            key={action}
            disabled={disabled}
            onClick={() => onAction(action)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </SettingsSection>
  );
}

function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  const message = error ? formatApiError(error, fallback) : fallback;
  if (!message) return null;
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {message}
    </p>
  );
}

function SettingsSection({
  title,
  summary,
  description,
  hint,
  disabled,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary?: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="operator-settings-section"
      open={defaultOpen || undefined}
    >
      <summary>
        <span className="settings-section-heading">
          <strong>{title}</strong>
          {summary ? <span>{summary}</span> : null}
        </span>
        <span className="settings-section-chevron" aria-hidden="true">
          <InterfaceIcon name="chevronDown" />
        </span>
      </summary>
      <fieldset disabled={disabled} className="settings-section-body">
        <legend className="sr-only">{title}</legend>
        {description ? (
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
        {children}
        {hint ? <p className="settings-section-hint">{hint}</p> : null}
      </fieldset>
    </details>
  );
}
