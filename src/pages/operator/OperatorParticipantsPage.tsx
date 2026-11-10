import Select from '@/shared/ui/Select';
import ParticipantTeamRoster from '@/components/operator/ParticipantTeamRoster';
import ParticipantBulkImport from '@/components/operator/ParticipantBulkImport';
import CollapsibleEditor from '@/components/operator/CollapsibleEditor';
import ParticipantDivisionsPanel from '@/components/operator/ParticipantDivisionsPanel';
import { hasContestPermission } from '@/domains/identityAccess/permissions';
import useConfirmation from '@/shared/ui/useConfirmation';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import { sharedUiText } from '@/data/uiText';
import {
  OperatorAccessGate,
  OperatorPanel,
  OperatorTabs,
  TeamIcon,
} from '@/components/operator/OperatorShell';
import { getOperatorContestDashboard } from '@/domains/contestAdministration/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import {
  addParticipantTeamMember,
  createParticipantTeam,
  deleteParticipantTeam,
  formatParticipantTeamError,
  listParticipantTeams,
  revokeParticipantMemberSessions,
  updateParticipantTeam,
  updateParticipantTeamMember,
} from '@/domains/teamParticipation/api';
import type {
  ParticipantTeam,
  TeamMember,
  TeamMemberRole,
} from '@/domains/teamParticipation/types';
import { formatApiError } from '@/shared/api/errors';

type TeamForm = {
  divisionId: string;
  leaderEmail: string;
  leaderId: string;
  leaderName: string;
  status: string;
  teamId: string;
  teamName: string;
};

const emptyTeamForm: TeamForm = {
  divisionId: '',
  leaderEmail: '',
  leaderId: '',
  leaderName: '',
  status: 'active',
  teamId: '',
  teamName: '',
};

const participantStatusOptions = [
  ['active', '활성'],
  ['disabled', '비활성'],
  ['disqualified', '실격'],
] as const;

export default function OperatorParticipantsPage() {
  const { contestId } = useParams();

  return (
    <OperatorAccessGate
      contestId={contestId}
      permission="contest.participant.view"
    >
      {(session) =>
        contestId ? (
          <OperatorParticipantsContent
            contestId={contestId}
            token={session.accessToken}
            canManageParticipants={hasContestPermission(
              session,
              contestId,
              'contest.participant.manage',
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

function OperatorParticipantsContent({
  contestId,
  token,
  canManageParticipants,
}: {
  contestId: string;
  token: string;
  canManageParticipants: boolean;
}) {
  const { confirm: confirmAction, dialog: confirmationDialog } =
    useConfirmation();

  const queryClient = useQueryClient();
  const queryIdentity = tokenQueryIdentity(token);
  const teamEditorRef = useRef<HTMLDivElement | null>(null);
  const [teamEditorOpen, setTeamEditorOpen] = useState(false);
  const [teamSaved, setTeamSaved] = useState('');
  const [teamForm, setTeamForm] = useState(emptyTeamForm);
  const [draftMembers, setDraftMembers] = useState<TeamMember[]>([]);
  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [formError, setFormError] = useState('');

  const dashboardQuery = useQuery({
    queryKey: ['operator', 'dashboard', contestId, queryIdentity],
    queryFn: () => getOperatorContestDashboard(contestId, token),
  });
  const teamsQuery = useQuery({
    queryKey: ['operator', 'participants', contestId, queryIdentity],
    queryFn: () => listParticipantTeams(contestId, token),
  });

  const divisions = useMemo(
    () => dashboardQuery.data?.divisions ?? [],
    [dashboardQuery.data?.divisions],
  );
  const teams = teamsQuery.data ?? [];
  const divisionById = useMemo(
    () =>
      new Map(divisions.map((division) => [division.division_id, division])),
    [divisions],
  );
  const filteredTeams = teams.filter((team) => {
    if (team.team_name.startsWith('__operator_test__:')) return false;
    const keyword = search.trim().toLowerCase();
    const matchesDivision =
      divisionFilter === 'all' || team.division_id === divisionFilter;
    const matchesKeyword =
      !keyword ||
      team.team_name.toLowerCase().includes(keyword) ||
      team.status.toLowerCase().includes(keyword) ||
      team.members.some(
        (member) =>
          member.name.toLowerCase().includes(keyword) ||
          member.email.toLowerCase().includes(keyword),
      );

    return matchesDivision && matchesKeyword;
  });

  function invalidateParticipants() {
    void queryClient.invalidateQueries({
      queryKey: ['operator', 'participants', contestId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['operator', 'dashboard', contestId],
    });
  }

  const saveTeamMutation = useMutation({
    mutationFn: async () => {
      const members = draftMembers
        .filter((member) => member.name.trim() || member.email.trim())
        .map((member) => ({
          email: member.email.trim(),
          name: member.name.trim(),
          role: 'member' as TeamMemberRole,
          team_member_id: member.team_member_id,
        }));

      if (!teamForm.teamId) {
        return createParticipantTeam(contestId, token, {
          division_id: teamForm.divisionId,
          leader: {
            email: teamForm.leaderEmail.trim(),
            name: teamForm.leaderName.trim(),
            role: 'leader',
          },
          members,
          team_name: teamForm.teamName.trim(),
        });
      }

      const updated = await updateParticipantTeam(
        contestId,
        teamForm.teamId,
        token,
        {
          division_id: teamForm.divisionId,
          status: teamForm.status,
          team_name: teamForm.teamName.trim(),
        },
      );

      if (teamForm.leaderId) {
        await updateParticipantTeamMember(
          contestId,
          teamForm.teamId,
          teamForm.leaderId,
          token,
          {
            email: teamForm.leaderEmail.trim(),
            name: teamForm.leaderName.trim(),
            role: 'leader',
          },
        );
      }

      for (const member of members) {
        if (member.team_member_id) {
          await updateParticipantTeamMember(
            contestId,
            teamForm.teamId,
            member.team_member_id,
            token,
            {
              email: member.email,
              name: member.name,
              role: 'member',
            },
          );
        } else {
          await addParticipantTeamMember(contestId, teamForm.teamId, token, {
            email: member.email,
            name: member.name,
            role: 'member',
          });
        }
      }

      return updated;
    },
    onSuccess: () => {
      setTeamSaved(
        teamForm.teamId
          ? '참가팀 정보를 저장했습니다.'
          : '참가팀을 등록했습니다.',
      );
      setTeamEditorOpen(false);
      setTeamForm(emptyTeamForm);
      setDraftMembers([]);
      setFormError('');
      invalidateParticipants();
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (team: ParticipantTeam) =>
      deleteParticipantTeam(contestId, team.participant_team_id, token),
    onSuccess: () => {
      setTeamForm(emptyTeamForm);
      setDraftMembers([]);
      invalidateParticipants();
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: ({ memberId, teamId }: { memberId: string; teamId: string }) =>
      revokeParticipantMemberSessions(contestId, teamId, memberId, token),
    onSuccess: invalidateParticipants,
  });

  function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamForm.teamName.trim() || !teamForm.divisionId) {
      setFormError('팀명과 참가 유형을 입력해야 합니다.');
      return;
    }
    if (
      !teamForm.teamId &&
      (!teamForm.leaderName.trim() || !teamForm.leaderEmail.trim())
    ) {
      setFormError('팀장 이름과 이메일이 필요합니다.');
      return;
    }
    saveTeamMutation.mutate();
  }

  function editTeam(team: ParticipantTeam) {
    setTeamEditorOpen(true);
    setTeamSaved('');
    saveTeamMutation.reset();
    const leader =
      team.members.find((member) => member.role === 'leader') ??
      team.members[0];
    setTeamForm({
      divisionId: team.division_id,
      leaderEmail: leader?.email ?? '',
      leaderId: leader?.team_member_id ?? '',
      leaderName: leader?.name ?? '',
      status: team.status,
      teamId: team.participant_team_id,
      teamName: team.team_name,
    });
    setDraftMembers(
      team.members
        .filter((member) => member.team_member_id !== leader?.team_member_id)
        .map((member) => ({ ...member, role: 'member' })),
    );
    setFormError('');
    window.requestAnimationFrame(() => {
      teamEditorRef.current
        ?.querySelector<HTMLInputElement>('input')
        ?.focus({ preventScroll: true });
      teamEditorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  function resetTeamEditor() {
    setTeamForm(emptyTeamForm);
    setDraftMembers([]);
    setFormError('');
  }

  function addDraftMember() {
    setDraftMembers((current) => [
      ...current,
      { email: '', name: '', role: 'member' },
    ]);
  }

  function updateDraftMember(index: number, values: Partial<TeamMember>) {
    setDraftMembers((current) =>
      current.map((member, memberIndex) =>
        memberIndex === index ? { ...member, ...values } : member,
      ),
    );
  }

  function removeDraftMember(index: number) {
    setDraftMembers((current) =>
      current.filter((_, memberIndex) => memberIndex !== index),
    );
  }

  async function confirmDeleteTeam(team: ParticipantTeam) {
    if (
      await confirmAction(
        `${team.team_name} 참가팀을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      )
    ) {
      deleteTeamMutation.mutate(team);
    }
  }

  return (
    <PageLayout
      navigation={<OperatorTabs contestId={contestId} />}
      variant="management"
      description="참가 유형, 참가팀, 멤버와 로그인 세션을 관리합니다."
      eyebrow="Operator"
      title="참가팀 관리"
      width="full"
    >
      {confirmationDialog}

      {dashboardQuery.error || teamsQuery.error ? (
        <ErrorBox
          error={dashboardQuery.error || teamsQuery.error}
          fallback="참가팀 데이터를 불러오지 못했습니다"
        />
      ) : null}

      {revokeSessionMutation.error ? (
        <ErrorBox
          error={revokeSessionMutation.error}
          fallback="계정을 로그아웃하지 못했습니다"
        />
      ) : null}
      {revokeSessionMutation.isSuccess ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          해당 계정의 모든 로그인 세션을 해제했습니다.
        </p>
      ) : null}

      {canManageParticipants && dashboardQuery.data ? (
        <ParticipantDivisionsPanel
          contestId={contestId}
          token={token}
          contest={dashboardQuery.data.contest}
          divisions={divisions}
        />
      ) : null}

      <div className="grid gap-6">
        <div className="grid gap-3" hidden={!canManageParticipants}>
          <div ref={teamEditorRef} className="scroll-mt-24">
            <CollapsibleEditor
              open={teamEditorOpen}
              onOpenChange={setTeamEditorOpen}
              busy={saveTeamMutation.isPending}
              draft={Boolean(
                teamForm.teamName ||
                teamForm.leaderName ||
                teamForm.leaderEmail ||
                teamForm.divisionId ||
                draftMembers.length,
              )}
              description="팀 정보, 팀장, 팀원을 한 카드에서 함께 등록하거나 수정합니다."
              title={teamForm.teamId ? '참가팀 수정' : '참가팀 등록'}
            >
              <form className="grid gap-4" onSubmit={submitTeam}>
                <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-semibold text-slate-600 uppercase">
                    팀 설정
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextInput
                      label="팀명"
                      onChange={(value) =>
                        setTeamForm((prev) => ({ ...prev, teamName: value }))
                      }
                      value={teamForm.teamName}
                    />
                    <SelectInput
                      label="참가 유형"
                      onChange={(value) =>
                        setTeamForm((prev) => ({ ...prev, divisionId: value }))
                      }
                      options={divisions.map((division) => ({
                        label: division.name,
                        value: division.division_id,
                      }))}
                      placeholder="유형 선택"
                      value={teamForm.divisionId}
                    />
                  </div>
                  {teamForm.teamId ? (
                    <SelectInput
                      label="상태"
                      onChange={(value) =>
                        setTeamForm((prev) => ({ ...prev, status: value }))
                      }
                      options={participantStatusOptions.map(
                        ([value, label]) => ({
                          label,
                          value,
                        }),
                      )}
                      value={teamForm.status}
                    />
                  ) : null}
                </div>

                <div className="grid gap-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                  <p className="text-xs font-semibold text-indigo-700 uppercase">
                    팀장 설정
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextInput
                      label="팀장 이름"
                      onChange={(value) =>
                        setTeamForm((prev) => ({ ...prev, leaderName: value }))
                      }
                      value={teamForm.leaderName}
                    />
                    <TextInput
                      label="팀장 이메일"
                      onChange={(value) =>
                        setTeamForm((prev) => ({ ...prev, leaderEmail: value }))
                      }
                      value={teamForm.leaderEmail}
                    />
                  </div>
                </div>

                <div className="grid gap-3 rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase">
                        팀원
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-600">
                        1인팀이면 비워두고, 여러 명이면 필요한 만큼 추가합니다.
                      </p>
                    </div>
                    <button
                      className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700"
                      onClick={addDraftMember}
                      type="button"
                    >
                      팀원 추가
                    </button>
                  </div>
                  {draftMembers.length > 0 ? (
                    <div className="grid gap-3">
                      {draftMembers.map((member, index) => (
                        <div
                          className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                          key={`${member.team_member_id ?? 'new'}-${index}`}
                        >
                          <TextInput
                            label={`팀원 ${index + 1} 이름`}
                            onChange={(value) =>
                              updateDraftMember(index, { name: value })
                            }
                            value={member.name}
                          />
                          <TextInput
                            label={`팀원 ${index + 1} 이메일`}
                            onChange={(value) =>
                              updateDraftMember(index, { email: value })
                            }
                            value={member.email}
                          />
                          <button
                            className="self-end rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:text-slate-300"
                            disabled={Boolean(member.team_member_id)}
                            onClick={() => removeDraftMember(index)}
                            title={
                              member.team_member_id
                                ? '이미 등록된 팀원은 이 화면에서 제거할 수 없습니다.'
                                : undefined
                            }
                            type="button"
                          >
                            제거
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-medium text-slate-600">
                      추가 팀원이 없습니다.
                    </p>
                  )}
                </div>

                {teamForm.teamId ? (
                  <div className="flex flex-wrap gap-2">
                    {participantStatusOptions.map(([status, label]) => (
                      <button
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"
                        key={status}
                        onClick={() =>
                          setTeamForm((prev) => ({ ...prev, status }))
                        }
                        type="button"
                      >
                        {label}로 표시
                      </button>
                    ))}
                  </div>
                ) : null}
                {formError || saveTeamMutation.error ? (
                  <ErrorBox
                    error={saveTeamMutation.error}
                    fallback={
                      formError ||
                      formatParticipantTeamError(
                        saveTeamMutation.error,
                        '참가팀 저장에 실패했습니다',
                      )
                    }
                  />
                ) : null}
                <button
                  className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={saveTeamMutation.isPending}
                  type="submit"
                >
                  <TeamIcon />
                  {saveTeamMutation.isPending
                    ? '저장 중…'
                    : teamForm.teamId
                      ? '변경사항 저장'
                      : '참가팀 등록'}
                </button>
                <div className="flex gap-2">
                  <button
                    className="h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600"
                    onClick={resetTeamEditor}
                    disabled={saveTeamMutation.isPending}
                    type="button"
                  >
                    {teamForm.teamId ? '수정 취소 · 새 팀 등록' : '입력 초기화'}
                  </button>
                </div>
              </form>
            </CollapsibleEditor>
          </div>

          <ParticipantBulkImport
            key={`${contestId}/${queryIdentity}`}
            contestId={contestId}
            token={token}
            divisions={divisions}
            onRegistered={invalidateParticipants}
          />
        </div>
        {teamSaved ? (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            {teamSaved}
          </p>
        ) : null}

        <OperatorPanel
          actions={
            <>
              <Select
                aria-label="참가팀 유형 필터"
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                onChange={(event) => setDivisionFilter(event.target.value)}
                value={divisionFilter}
              >
                <option value="all">전체 유형</option>
                {divisions.map((division) => (
                  <option
                    key={division.division_id}
                    value={division.division_id}
                  >
                    {division.name}
                  </option>
                ))}
              </Select>
              <input
                aria-label="참가팀 검색"
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="팀/이름/이메일/상태 검색"
                value={search}
              />
            </>
          }
          description="등록된 참가팀과 팀원 상태입니다."
          title="참가팀 목록"
        >
          <div className="grid min-w-0 gap-4">
            {filteredTeams.length > 0 ? (
              filteredTeams.map((team) => (
                <ParticipantTeamRoster
                  key={team.participant_team_id}
                  team={team}
                  divisionName={
                    divisionById.get(team.division_id)?.name ??
                    team.division?.name ??
                    '-'
                  }
                  pending={revokeSessionMutation.isPending}
                  canManage={canManageParticipants}
                  onEdit={() => editTeam(team)}
                  onDelete={() => confirmDeleteTeam(team)}
                  onRevoke={(member) => {
                    if (member.team_member_id)
                      revokeSessionMutation.mutate({
                        memberId: member.team_member_id,
                        teamId: team.participant_team_id,
                      });
                  }}
                />
              ))
            ) : (
              <p className="rounded-xl border border-slate-200 px-4 py-10 text-center text-sm font-medium text-slate-600">
                표시할 참가팀이 없습니다.
              </p>
            )}
          </div>
        </OperatorPanel>
      </div>
    </PageLayout>
  );
}

function TextInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function SelectInput({
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <Select
        className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {error ? formatApiError(error, fallback) : fallback}
    </p>
  );
}
