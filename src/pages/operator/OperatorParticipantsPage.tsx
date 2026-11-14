import Select from '@/shared/ui/Select';
import ParticipantTeamRoster from '@/components/operator/ParticipantTeamRoster';
import ParticipantAccessDialog, {
  type ParticipantAccessTarget,
} from '@/components/operator/ParticipantAccessDialog';
import ParticipantWithdrawalDialog from '@/components/operator/ParticipantWithdrawalDialog';
import ParticipantBulkImport from '@/components/operator/ParticipantBulkImport';
import CollapsibleEditor from '@/components/operator/CollapsibleEditor';
import ParticipantTeamEditDialog from '@/components/operator/ParticipantTeamEditDialog';
import ParticipantTeamFormFields from '@/components/operator/ParticipantTeamFormFields';
import {
  participantTeamDraftError,
  type ParticipantTeamFormValue,
} from '@/domains/teamParticipation/teamDraft';
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
  createParticipantTeam,
  deleteParticipantTeam,
  formatParticipantTeamError,
  listParticipantTeams,
  updateParticipantMemberAccess,
  updateParticipantTeamAccess,
  updateParticipantTeamWithdrawal,
} from '@/domains/teamParticipation/api';
import type {
  ParticipantTeam,
  TeamMember,
} from '@/domains/teamParticipation/types';
import { formatApiError } from '@/shared/api/errors';

const emptyTeamForm: ParticipantTeamFormValue = {
  divisionId: '',
  leaderEmail: '',
  leaderName: '',
  status: 'active',
  teamName: '',
};

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
            key={`${contestId}/${tokenQueryIdentity(session.accessToken)}`}
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
  const createBusy = useRef(false);
  const [editingTeam, setEditingTeam] = useState<ParticipantTeam | null>(null);
  const [teamEditorOpen, setTeamEditorOpen] = useState(false);
  const [teamSaved, setTeamSaved] = useState('');
  const [teamForm, setTeamForm] = useState(emptyTeamForm);
  const [draftMembers, setDraftMembers] = useState<TeamMember[]>([]);
  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [formError, setFormError] = useState('');
  const [accessTarget, setAccessTarget] =
    useState<ParticipantAccessTarget | null>(null);
  const [accessSaved, setAccessSaved] = useState('');
  const [withdrawalTarget, setWithdrawalTarget] =
    useState<ParticipantTeam | null>(null);

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
      (team.withdrawn && '기권'.includes(keyword)) ||
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

  const createTeamMutation = useMutation({
    mutationFn: () =>
      createParticipantTeam(contestId, token, {
        division_id: teamForm.divisionId,
        leader: {
          email: teamForm.leaderEmail.trim(),
          name: teamForm.leaderName.trim(),
          role: 'leader',
        },
        members: draftMembers
          .filter((member) => member.name.trim() || member.email.trim())
          .map((member) => ({
            email: member.email.trim(),
            name: member.name.trim(),
            role: 'member',
          })),
        team_name: teamForm.teamName.trim(),
      }),
    onSuccess: () => {
      setTeamSaved('참가팀을 등록했습니다.');
      setTeamEditorOpen(false);
      setTeamForm(emptyTeamForm);
      setDraftMembers([]);
      setFormError('');
      invalidateParticipants();
    },
    onSettled: () => {
      createBusy.current = false;
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (team: ParticipantTeam) =>
      deleteParticipantTeam(contestId, team.participant_team_id, token),
    onSuccess: invalidateParticipants,
  });

  const accessMutation = useMutation({
    mutationFn: async ({
      target,
      reason,
    }: {
      target: ParticipantAccessTarget;
      reason: string;
    }) => {
      const { team, member } = target;
      const body = {
        blocked: !(member ?? team).access_blocked,
        ...(reason ? { reason } : {}),
      };
      if (member?.team_member_id)
        return updateParticipantMemberAccess(
          contestId,
          team.participant_team_id,
          member.team_member_id,
          token,
          body,
        );
      return updateParticipantTeamAccess(
        contestId,
        team.participant_team_id,
        token,
        body,
      );
    },
    onSuccess: (_, { target }) => {
      const blocked = Boolean((target.member ?? target.team).access_blocked);
      setAccessSaved(
        `${target.member?.name ?? target.team.team_name}${target.member ? ' 개인' : ' 팀 전체'} ${blocked ? '차단을 해제했습니다.' : '접근을 차단했습니다.'}`,
      );
      setAccessTarget(null);
      invalidateParticipants();
    },
  });

  const withdrawalMutation = useMutation({
    mutationFn: ({ team, reason }: { team: ParticipantTeam; reason: string }) =>
      updateParticipantTeamWithdrawal(
        contestId,
        team.participant_team_id,
        token,
        {
          withdrawn: !team.withdrawn,
          ...(reason ? { reason } : {}),
        },
      ),
    onSuccess: (_, { team }) => {
      setAccessSaved(
        team.withdrawn
          ? `${team.team_name} 팀의 기권을 취소했습니다. 별도로 설정한 차단은 유지됩니다.`
          : `${team.team_name} 팀을 기권 처리했습니다. 스코어보드에서 제외하고 대회 접근을 차단했습니다.`,
      );
      setWithdrawalTarget(null);
      invalidateParticipants();
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'scoreboard', contestId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['contest-scoreboard', contestId],
      });
    },
  });

  function openWithdrawalDialog(team: ParticipantTeam) {
    if (!canManageParticipants) return;
    withdrawalMutation.reset();
    setAccessSaved('');
    setWithdrawalTarget(team);
  }

  function openAccessDialog(target: ParticipantAccessTarget) {
    if (!canManageParticipants) return;
    accessMutation.reset();
    setAccessSaved('');
    setAccessTarget(target);
  }

  function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canManageParticipants ||
      createBusy.current ||
      createTeamMutation.isPending
    )
      return;
    const error = participantTeamDraftError(teamForm, draftMembers);
    setFormError(error);
    if (error) return;
    createBusy.current = true;
    createTeamMutation.mutate();
  }

  function editTeam(team: ParticipantTeam) {
    if (!canManageParticipants || createTeamMutation.isPending) return;
    setEditingTeam(team);
  }

  function resetTeamEditor() {
    if (createTeamMutation.isPending) return;
    setTeamForm(emptyTeamForm);
    setDraftMembers([]);
    setFormError('');
    createTeamMutation.reset();
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
      description="참가 유형, 참가팀, 기권·접근 차단과 로그인 세션을 관리합니다."
      eyebrow="Operator"
      title="참가팀 관리"
      width="full"
    >
      {confirmationDialog}
      {editingTeam && canManageParticipants ? (
        <ParticipantTeamEditDialog
          key={editingTeam.participant_team_id}
          contestId={contestId}
          token={token}
          team={editingTeam}
          divisions={divisions}
          onClose={() => setEditingTeam(null)}
          onSaved={() => {
            setEditingTeam(null);
            setTeamSaved('참가팀 정보를 저장했습니다.');
            invalidateParticipants();
          }}
        />
      ) : null}
      {withdrawalTarget && canManageParticipants ? (
        <ParticipantWithdrawalDialog
          key={withdrawalTarget.participant_team_id}
          team={withdrawalTarget}
          pending={withdrawalMutation.isPending}
          error={withdrawalMutation.error}
          onClose={() => setWithdrawalTarget(null)}
          onConfirm={(reason) => {
            if (!withdrawalMutation.isPending)
              withdrawalMutation.mutate({ team: withdrawalTarget, reason });
          }}
        />
      ) : null}
      {accessTarget && canManageParticipants ? (
        <ParticipantAccessDialog
          target={accessTarget}
          pending={accessMutation.isPending}
          error={accessMutation.error}
          onClose={() => setAccessTarget(null)}
          onConfirm={(reason) => {
            if (!accessMutation.isPending)
              accessMutation.mutate({ target: accessTarget, reason });
          }}
        />
      ) : null}
      {accessSaved ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {accessSaved}
        </p>
      ) : null}

      {dashboardQuery.error || teamsQuery.error ? (
        <ErrorBox
          error={dashboardQuery.error || teamsQuery.error}
          fallback="참가팀 데이터를 불러오지 못했습니다"
        />
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
          <div>
            <CollapsibleEditor
              open={teamEditorOpen}
              onOpenChange={setTeamEditorOpen}
              busy={createTeamMutation.isPending}
              draft={Boolean(
                teamForm.teamName ||
                teamForm.leaderName ||
                teamForm.leaderEmail ||
                teamForm.divisionId ||
                draftMembers.length,
              )}
              description="새 참가팀을 등록합니다. 기존 팀은 목록의 편집 버튼에서 수정합니다."
              title="참가팀 등록"
            >
              <form
                aria-label="참가팀 등록"
                className="grid min-w-0 gap-4"
                onSubmit={submitTeam}
              >
                <ParticipantTeamFormFields
                  divisions={divisions}
                  value={teamForm}
                  members={draftMembers}
                  onChange={setTeamForm}
                  onMembersChange={setDraftMembers}
                  disabled={createTeamMutation.isPending}
                />
                {formError || createTeamMutation.error ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
                  >
                    {formError ||
                      formatParticipantTeamError(
                        createTeamMutation.error,
                        '참가팀 등록에 실패했습니다',
                      )}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={createTeamMutation.isPending}
                    type="submit"
                  >
                    <TeamIcon />
                    {createTeamMutation.isPending ? '등록 중…' : '참가팀 등록'}
                  </button>
                  <button
                    className="h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 disabled:opacity-50"
                    onClick={resetTeamEditor}
                    disabled={createTeamMutation.isPending}
                    type="button"
                  >
                    입력 초기화
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
                  pending={
                    createTeamMutation.isPending ||
                    accessMutation.isPending ||
                    withdrawalMutation.isPending
                  }
                  canManage={canManageParticipants}
                  onEdit={() => editTeam(team)}
                  onDelete={() => confirmDeleteTeam(team)}
                  onTeamAccess={() => openAccessDialog({ team })}
                  onWithdrawal={() => openWithdrawalDialog(team)}
                  onMemberAccess={(member) =>
                    openAccessDialog({ team, member })
                  }
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

function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {error ? formatApiError(error, fallback) : fallback}
    </p>
  );
}
