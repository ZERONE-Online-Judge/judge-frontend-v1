import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useState } from 'react';
import type {
  Contest,
  ScoreboardFreezeMode,
} from '@/domains/contestAdministration/types';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import { formatDateTime } from '@/shared/lib/dateTime';

const labels = { auto: '오토', live: '라이브', frozen: '프리즈' };
export type FreezeChange = {
  from: ScoreboardFreezeMode;
  to: ScoreboardFreezeMode;
  freezeAt: string;
};

function freezeChangeDescription(mode: ScoreboardFreezeMode, freezeAt: string) {
  const moment = formatDateTime(freezeAt);
  if (mode === 'live')
    return '프리즈를 해제하고 최신 채점 결과와 순위를 즉시 공개합니다. 프리즈 시각이 지나도 자동으로 가려지지 않습니다.';
  if (mode === 'frozen')
    return `공개 성적을 고정합니다. 설정된 프리즈 시각(${moment})이 이미 지났다면 그 시각 기준으로 돌아가고, 아직 지나지 않았다면 지금 기준으로 고정합니다. 이후 채점 결과는 가려집니다.`;
  return `설정된 프리즈 시각(${moment})을 따릅니다. 그 시각 전에는 최신 성적을 공개하고, 그 시각부터는 이후 채점 결과를 가립니다. 수동 프리즈 중이었다면 숨겨졌던 성적이 다시 공개될 수 있습니다.`;
}

export default function ScoreboardFreezeDialog({
  change,
  contest,
  unavailable,
  onCancel,
  onConfirm,
}: {
  change: FreezeChange;
  contest: Contest;
  unavailable: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [step, setStep] = useState(1);
  const changed =
    (contest.scoreboard_freeze_mode ?? 'auto') !== change.from ||
    contest.freeze_at !== change.freezeAt;
  const blocked = changed || unavailable;
  return (
    <ModalDialog
      key={step}
      title={step === 1 ? '공개 상태 변경 안내' : '정말 실행하시겠습니까?'}
      onClose={onCancel}
      eyebrow={`스코어보드 전환 · ${step} / 2`}
      footer={
        <>
          <ModalButton onClick={onCancel}>취소</ModalButton>
          <ModalButton
            tone={step === 1 ? 'primary' : 'danger'}
            disabled={blocked}
            onClick={() => {
              if (step === 1) setStep(2);
              else onConfirm();
            }}
          >
            {step === 1 ? '내용 확인' : `${labels[change.to]}로 전환`}
          </ModalButton>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="zoj-inset flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <span className="text-slate-500">{labels[change.from]}</span>
          <span aria-hidden="true">
            <InterfaceIcon name="arrowRight" />
          </span>
          <strong className="text-indigo-700">{labels[change.to]}</strong>
        </div>
        <p className="zoj-modal-copy">
          {freezeChangeDescription(change.to, change.freezeAt)}
        </p>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          {step === 1
            ? '참가자 스코어보드와 모든 프레젠테이션 화면에 함께 적용됩니다. 운영자 내부 순위와 채점은 계속 갱신됩니다.'
            : '확인 즉시 공개 화면이 변경됩니다. 이미 공개된 성적은 모드를 다시 바꿔도 참가자가 본 내용을 되돌릴 수 없습니다.'}
        </p>
        {blocked ? (
          <p role="alert" className="text-sm text-rose-700">
            대회 상태 또는 프리즈 설정이 변경되었습니다. 창을 닫고 현재 설정을
            확인한 뒤 다시 시도해 주세요.
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}
