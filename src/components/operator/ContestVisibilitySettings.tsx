import { ChoiceCard, SettingsCard } from '@/components/common/ManagementCards';
import type { ContestVisibility } from '@/domains/contestAdministration/types';

export default function ContestVisibilitySettings({
  visibility,
  afterEnd,
  onChange,
}: {
  visibility: ContestVisibility;
  afterEnd: ContestVisibility;
  onChange: (
    field: 'visibility' | 'visibility_after_end',
    value: ContestVisibility,
  ) => void;
}) {
  return (
    <>
      <SettingsCard
        title="대회 공개 여부"
        description="대회 종료 전, 대회 목록과 소개를 볼 수 있는 대상을 정합니다."
        hint="상태가 ‘초안’ 또는 ‘예정(비공개)’이면 이 설정과 관계없이 운영자에게만 보입니다. 등록된 참가자도 볼 수 없습니다."
      >
        <div className="zoj-settings-fields">
          <ChoiceCard
            name="visibility"
            value="public"
            title="공개"
            checked={visibility === 'public'}
            description="로그인하지 않아도 대회 목록과 소개를 볼 수 있습니다."
            onChange={() => onChange('visibility', 'public')}
          />
          <ChoiceCard
            name="visibility"
            value="private"
            title="비공개"
            checked={visibility === 'private'}
            description="해당 대회의 참가자와 운영자가 로그인한 경우에만 보입니다."
            onChange={() => onChange('visibility', 'private')}
          />
        </div>
      </SettingsCard>
      <SettingsCard
        title="종료 후 대회 공개 여부"
        description="대회가 종료되면 아래 설정으로 자동 전환됩니다."
        hint={
          afterEnd === 'private'
            ? '종료 후 비공개인 대회는 자료를 비로그인 공개할 수 없습니다. 기존 비로그인 공개 자료는 참가자 공개로 변경됩니다.'
            : '대회 목록과 소개를 공개합니다. 문제집·스코어보드 등 자료를 볼 수 있는 대상은 종료 후 자료 공개 범위에서 따로 정합니다.'
        }
      >
        <div className="zoj-settings-fields">
          <ChoiceCard
            name="visibility_after_end"
            value="public"
            title="공개"
            checked={afterEnd === 'public'}
            description="종료 후 누구나 대회 목록과 소개를 볼 수 있습니다."
            onChange={() => onChange('visibility_after_end', 'public')}
          />
          <ChoiceCard
            name="visibility_after_end"
            value="private"
            title="비공개"
            checked={afterEnd === 'private'}
            description="종료 후에도 해당 참가자와 운영자에게만 보입니다."
            onChange={() => onChange('visibility_after_end', 'private')}
          />
        </div>
      </SettingsCard>
    </>
  );
}
