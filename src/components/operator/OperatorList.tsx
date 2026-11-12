import type { StaffAccount } from '@/domains/identityAccess/types';
import {
  CONTEST_ROLES,
  contestRoleTitleForAccount,
  contestRolesForAccount,
  isAssignedContestMaster,
  isContestOwner,
} from '@/domains/identityAccess/contestRoles';

export default function OperatorList({
  canAssignMaster,
  contestId,
  disabled,
  onEdit,
  onRemove,
  operators,
}: {
  canAssignMaster: boolean;
  contestId: string;
  disabled: boolean;
  onEdit: (operator: StaffAccount) => void;
  onRemove: (operator: StaffAccount) => void;
  operators: StaffAccount[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {operators.map((operator) => {
        const roles = contestRolesForAccount(operator, contestId);
        const roleTitle = contestRoleTitleForAccount(operator, contestId);
        const assignedMaster =
          isContestOwner(operator, contestId) ||
          isAssignedContestMaster(operator, contestId);
        const protectedOperator =
          assignedMaster || (!canAssignMaster && roles.includes('master'));
        const canEdit = canAssignMaster || !protectedOperator;
        return (
          <div
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 p-4"
            key={operator.email}
          >
            <div className="grid gap-1">
              <strong className="zoj-break-anywhere font-semibold text-slate-950">
                {operator.display_name}
                {roleTitle ? (
                  <span className="font-medium text-slate-600">
                    {' '}
                    / {roleTitle}
                  </span>
                ) : null}
              </strong>
              <span className="zoj-break-anywhere text-xs text-slate-600">
                {operator.email}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="부여된 권한">
              {roles.map((role) => (
                <span
                  className={`rounded-md px-2 py-1 text-xs font-medium ${role === 'master' || role === 'owner' ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-700'}`}
                  key={role}
                >
                  {CONTEST_ROLES.find((option) => option.value === role)
                    ?.label ?? role}
                </span>
              ))}
            </div>
            {protectedOperator ? (
              <p className="text-xs leading-5 text-slate-600">
                {assignedMaster
                  ? '총괄은 강등하거나 제거할 수 없습니다. 대회 총괄 영역에서 현재 총괄이 위임하거나 서비스 마스터가 변경할 수 있습니다.'
                  : '대회 마스터만 이 운영자의 권한을 관리할 수 있습니다.'}
              </p>
            ) : null}
            {canEdit ? (
              <div className="mt-auto flex gap-2 pt-1">
                <button
                  className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => onEdit(operator)}
                  type="button"
                >
                  {assignedMaster ? '이름 수정' : '이름·이메일·권한 수정'}
                </button>
                {!protectedOperator ? (
                  <button
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50"
                    disabled={disabled}
                    onClick={() => onRemove(operator)}
                    type="button"
                  >
                    제거
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
