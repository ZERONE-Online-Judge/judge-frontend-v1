import { ChoiceCard, SettingsCard } from '@/components/common/ManagementCards';
import {
  CONTEST_ROLES,
  withIncludedContestRoles,
  type ContestRole,
} from '@/domains/identityAccess/contestRoles';

export default function ContestRoleSelector({
  canAssignMaster,
  disabled,
  onChange,
  value,
}: {
  canAssignMaster: boolean;
  disabled?: boolean;
  onChange: (roles: ContestRole[]) => void;
  value: ContestRole[];
}) {
  const selectedRoles = withIncludedContestRoles(value);
  const includesReview = selectedRoles.includes('problem_author');
  const includesProblemView = selectedRoles.includes('problem_reviewer');
  function toggleRole(role: ContestRole, checked: boolean) {
    if (!checked) {
      onChange(
        withIncludedContestRoles(selectedRoles.filter((item) => item !== role)),
      );
      return;
    }
    onChange(
      role === 'master'
        ? [role]
        : withIncludedContestRoles([
            ...selectedRoles.filter((item) => item !== 'master'),
            role,
          ]),
    );
  }

  return (
    <SettingsCard
      title="권한 (필수)"
      disabled={disabled}
      description="담당할 권한을 하나 이상 선택하세요. 참가자 미리보기는 다른 운영 권한과 함께 선택할 수 있습니다. 대회 마스터는 단독으로 선택합니다. 검수진은 문제 확인 권한을, 출제진은 검수진과 문제 확인 권한을 자동으로 포함합니다."
      hint={
        !canAssignMaster
          ? '대회 마스터 권한은 마스터만 부여할 수 있습니다.'
          : undefined
      }
    >
      <div className="zoj-settings-fields">
        {CONTEST_ROLES.filter(
          (role) =>
            role.value !== 'owner' &&
            (canAssignMaster || role.value !== 'master'),
        ).map((role) => (
          <ChoiceCard
            key={role.value}
            checked={selectedRoles.includes(role.value)}
            disabled={
              disabled ||
              (role.value === 'problem_reviewer' && includesReview) ||
              (role.value === 'problems_viewer' && includesProblemView)
            }
            onChange={(checked) => toggleRole(role.value, checked)}
            type="checkbox"
            value={role.value}
            title={role.label}
            description={role.description}
          />
        ))}
      </div>
    </SettingsCard>
  );
}
