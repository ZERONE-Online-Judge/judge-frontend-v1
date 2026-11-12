import { useId, useState } from 'react';
import type { ParticipantTeam } from '@/domains/teamParticipation/types';
import { formatApiError } from '@/shared/api/errors';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';

export default function ParticipantWithdrawalDialog({
  team,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  team: ParticipantTeam;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const formId = useId();
  const [reason, setReason] = useState('');
  const restoring = Boolean(team.withdrawn);
  const action = restoring ? '기권 취소' : '기권 처리';
  const individuallyBlocked = team.members.filter(
    (member) => member.access_blocked,
  ).length;

  function close() {
    if (!pending) onClose();
  }

  return (
    <ModalDialog
      title={`팀 ${action}`}
      description="기권은 팀 전체에 적용됩니다."
      onClose={close}
      closeOnBackdrop={!pending}
      size="md"
      footer={
        <>
          <ModalButton disabled={pending} onClick={close}>
            닫기
          </ModalButton>
          <ModalButton
            type="submit"
            form={formId}
            disabled={pending}
            tone={restoring ? 'primary' : 'danger'}
          >
            {pending ? '변경 중…' : action}
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
            팀 전체 · {team.members.length}명
          </p>
          <p className="zoj-break-anywhere mt-1 font-semibold text-slate-950">
            {team.team_name}
          </p>
          <p className="zoj-break-anywhere mt-2 text-sm leading-6 text-slate-600">
            {team.members.map((member) => member.name).join(' · ')}
          </p>
        </div>
        <div className="grid gap-2 text-sm leading-6 text-slate-600">
          <p>
            {restoring
              ? '기권을 취소하면 스코어보드에 팀의 기존 기록이 다시 반영되고, 기권으로 적용된 대회 접근 차단이 해제됩니다.'
              : '기권한 팀은 스코어보드에서 제외되며, 모든 팀원의 대회 접근이 차단됩니다. 문제 열람과 제출 등 대회 기능을 이용할 수 없습니다.'}
          </p>
          <p>
            기존 제출과 채점 기록은 보존됩니다.{' '}
            {!restoring ? '언제든 기권을 취소할 수 있습니다. ' : ''}
            다른 대회에는 영향을 주지 않습니다.
          </p>
        </div>
        <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          순위 발표가 진행 중이라면 해당 참가 유형의 공개 진행이 초기화됩니다.
          이미 모든 순위를 공개한 경우에는 공개 상태를 유지합니다.
        </p>
        {restoring && (team.access_blocked || individuallyBlocked > 0) ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800">
            별도로 설정한{' '}
            {[
              team.access_blocked ? '팀 전체 차단' : '',
              individuallyBlocked ? `개인 차단 ${individuallyBlocked}명` : '',
            ]
              .filter(Boolean)
              .join('과 ')}
            은 유지됩니다. 접근을 허용하려면 해당 차단도 따로 해제하세요.
          </p>
        ) : null}
        {!restoring ? (
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            기권 사유{' '}
            <span className="font-normal text-slate-500">
              선택 · 참가자에게 표시됩니다
            </span>
            <textarea
              className="min-h-24 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              value={reason}
              disabled={pending}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="참가자에게 안내할 기권 사유를 입력하세요."
            />
          </label>
        ) : team.withdrawal_reason ? (
          <p className="zoj-break-anywhere text-sm leading-6 whitespace-pre-wrap text-slate-600">
            기권 사유: {team.withdrawal_reason}
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
