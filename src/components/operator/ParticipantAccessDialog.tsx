import { useId, useState } from 'react';
import type {
  ParticipantTeam,
  TeamMember,
} from '@/domains/teamParticipation/types';
import { formatApiError } from '@/shared/api/errors';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';

export type ParticipantAccessTarget = {
  team: ParticipantTeam;
  member?: TeamMember;
};

export default function ParticipantAccessDialog({
  target,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  target: ParticipantAccessTarget;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const formId = useId();
  const { team, member } = target;
  const blocked = Boolean((member ?? team).access_blocked);
  const label = member ? `${member.name} (${member.email})` : team.team_name;
  const action = blocked ? '차단 해제' : '접근 차단';
  const [reason, setReason] = useState('');
  const individuallyBlocked = team.members.filter(
    (item) => item.access_blocked,
  ).length;

  function close() {
    if (!pending) onClose();
  }

  return (
    <ModalDialog
      title={`${member ? '개인' : '팀 전체'} ${action}`}
      description="이 대회의 참가자 접근만 변경합니다."
      onClose={close}
      closeOnBackdrop={!pending}
      size="md"
      footer={
        <>
          <ModalButton disabled={pending} onClick={close}>
            취소
          </ModalButton>
          <ModalButton
            type="submit"
            form={formId}
            disabled={pending}
            tone={blocked ? 'primary' : 'danger'}
          >
            {pending ? '변경 중…' : `${member ? '개인' : '팀 전체'} ${action}`}
          </ModalButton>
        </>
      }
    >
      <form
        id={formId}
        className="grid min-w-0 gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) onConfirm(reason.trim());
        }}
      >
        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-500">
            {member
              ? `개인 · ${team.team_name}`
              : `팀 전체 · ${team.members.length}명`}
          </p>
          <p className="zoj-break-anywhere mt-1 font-semibold text-slate-950">
            {label}
          </p>
          {!member ? (
            <p className="zoj-break-anywhere mt-2 text-sm leading-6 text-slate-600">
              {team.members.map((item) => item.name).join(' · ')}
            </p>
          ) : null}
        </div>
        <p className="text-sm leading-6 text-slate-600">
          {blocked
            ? '선택한 차단을 해제합니다. 다른 대회의 접근 상태는 바뀌지 않습니다.'
            : '대회 페이지와 문제, 제출, 스코어보드, 게시판 등 모든 참가 기능을 차단합니다. 다른 대회에는 영향을 주지 않습니다.'}{' '}
          계정 로그인과 기존 제출·순위는 유지됩니다.
        </p>
        {blocked && member && team.access_blocked ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800">
            팀 전체 차단이 적용 중입니다. 개인 차단을 해제해도 팀 차단을
            해제하기 전까지 접근할 수 없습니다.
          </p>
        ) : blocked && !member && individuallyBlocked ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800">
            개인 차단된 {individuallyBlocked}명은 계속 차단됩니다. 개인 차단은
            각 팀원의 버튼에서 따로 해제하세요.
          </p>
        ) : null}
        {!blocked ? (
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            차단 사유{' '}
            <span className="font-normal text-slate-500">
              선택 · 참가자에게 표시됩니다
            </span>
            <textarea
              className="min-h-24 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              value={reason}
              disabled={pending}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="참가자에게 안내할 사유를 입력하세요."
            />
          </label>
        ) : (member ?? team).access_block_reason ? (
          <p className="zoj-break-anywhere text-sm leading-6 text-slate-600">
            기존 차단 사유: {(member ?? team).access_block_reason}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm leading-6 text-rose-700">
            {formatApiError(error, `${action}에 실패했습니다`)}
          </p>
        ) : null}
      </form>
    </ModalDialog>
  );
}
