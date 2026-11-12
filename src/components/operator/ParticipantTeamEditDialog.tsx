import { type FormEvent, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Division } from '@/domains/contestAdministration/types';
import type {
  ParticipantTeam,
  TeamMember,
} from '@/domains/teamParticipation/types';
import {
  addParticipantTeamMember,
  formatParticipantTeamError,
  updateParticipantTeam,
  updateParticipantTeamMember,
} from '@/domains/teamParticipation/api';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import ParticipantTeamFormFields from '@/components/operator/ParticipantTeamFormFields';
import {
  participantTeamDraftError,
  type ParticipantTeamFormValue,
} from '@/domains/teamParticipation/teamDraft';

export default function ParticipantTeamEditDialog({
  contestId,
  token,
  team,
  divisions,
  onClose,
  onSaved,
}: {
  contestId: string;
  token: string;
  team: ParticipantTeam;
  divisions: Division[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const busy = useRef(false);
  const leader =
    team.members.find((member) => member.role === 'leader') ?? team.members[0];
  const [value, setValue] = useState<ParticipantTeamFormValue>(() => ({
    divisionId: team.division_id,
    teamName: team.team_name,
    status: team.status,
    leaderName: leader?.name ?? '',
    leaderEmail: leader?.email ?? '',
  }));
  const [members, setMembers] = useState<TeamMember[]>(() =>
    team.members
      .filter((member) => member !== leader)
      .map((member) => ({ ...member, role: 'member' })),
  );
  const [formError, setFormError] = useState('');
  const mutation = useMutation({
    mutationFn: async (draft: {
      value: ParticipantTeamFormValue;
      members: TeamMember[];
    }) => {
      const teamId = team.participant_team_id;
      await updateParticipantTeam(contestId, teamId, token, {
        division_id: draft.value.divisionId,
        team_name: draft.value.teamName.trim(),
        status: draft.value.status,
      });
      if (leader?.team_member_id) {
        await updateParticipantTeamMember(
          contestId,
          teamId,
          leader.team_member_id,
          token,
          {
            email: draft.value.leaderEmail.trim(),
            name: draft.value.leaderName.trim(),
            role: 'leader',
          },
        );
      }
      for (const [index, member] of draft.members.entries()) {
        if (!member.name.trim() && !member.email.trim()) continue;
        const body = {
          email: member.email.trim(),
          name: member.name.trim(),
          role: 'member' as const,
        };
        if (member.team_member_id) {
          await updateParticipantTeamMember(
            contestId,
            teamId,
            member.team_member_id,
            token,
            body,
          );
        } else {
          const saved = await addParticipantTeamMember(
            contestId,
            teamId,
            token,
            body,
          );
          // Keep an added member's identity if a later request fails, so retry
          // updates that member instead of attempting to add it twice.
          if (saved.team_member_id)
            setMembers((current) =>
              current.map((entry, memberIndex) =>
                memberIndex === index
                  ? { ...entry, team_member_id: saved.team_member_id }
                  : entry,
              ),
            );
        }
      }
    },
    onSuccess: onSaved,
    onSettled: () => {
      busy.current = false;
    },
  });

  function close() {
    if (!busy.current && !mutation.isPending) onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || mutation.isPending) return;
    const error = participantTeamDraftError(value, members);
    setFormError(error);
    if (error) return;
    busy.current = true;
    mutation.mutate({ value, members });
  }

  return (
    <ModalDialog
      title="참가팀 수정"
      aria-label="참가팀 수정"
      description={team.team_name}
      onClose={close}
      closeOnBackdrop={!mutation.isPending}
      size="lg"
      footer={
        <>
          <ModalButton disabled={mutation.isPending} onClick={close}>
            취소
          </ModalButton>
          <ModalButton
            type="submit"
            form={formId}
            tone="primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? '저장 중…' : '변경사항 저장'}
          </ModalButton>
        </>
      }
    >
      <form id={formId} className="grid min-w-0 gap-4" onSubmit={submit}>
        <ParticipantTeamFormFields
          divisions={divisions}
          value={value}
          members={members}
          onChange={setValue}
          onMembersChange={setMembers}
          editing
          disabled={mutation.isPending}
        />
        {formError || mutation.error ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
          >
            {formError ||
              formatParticipantTeamError(
                mutation.error,
                '참가팀 저장에 실패했습니다',
              )}
          </p>
        ) : null}
      </form>
    </ModalDialog>
  );
}
