import Select from '@/shared/ui/Select';
import { useId, useState } from 'react';
import { OperatorPanel } from '@/components/operator/OperatorShell';
import {
  isContestOwner,
  contestRoleTitleForAccount,
} from '@/domains/identityAccess/contestRoles';
import type { StaffAccount } from '@/domains/identityAccess/types';
import { formatApiError } from '@/shared/api/errors';

export default function ContestOwnerPanel({
  contestId,
  actorEmail,
  operators,
  loading,
  busy,
  error,
  onTransfer,
}: {
  contestId: string;
  actorEmail: string;
  operators: StaffAccount[];
  loading: boolean;
  busy: boolean;
  error: unknown;
  onTransfer: (email: string) => void;
}) {
  const helpId = useId();
  const [email, setEmail] = useState('');
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const owner = operators.find((operator) =>
    isContestOwner(operator, contestId),
  );
  const candidates = operators.filter(
    (operator) => !operator.is_service_master && operator !== owner,
  );
  const selected = candidates.find((operator) => operator.email === email);
  const canTransfer = owner?.email.toLowerCase() === actorEmail.toLowerCase();

  return (
    <OperatorPanel
      title="대회 총괄"
      description="총괄은 대회마다 한 명이며, 모든 운영 권한을 가집니다. 현재 총괄만 다른 운영자에게 위임할 수 있습니다."
    >
      {loading ? (
        <p className="text-sm text-slate-600">총괄 정보를 불러오는 중입니다.</p>
      ) : owner ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/60 p-5">
            <p className="text-xs font-semibold tracking-wide text-amber-800">
              현재 대회 총괄
            </p>
            <p className="zoj-break-anywhere mt-2 text-lg font-semibold text-slate-950">
              {owner.display_name}{' '}
              <span className="text-sm font-medium text-amber-700">/ 총괄</span>
            </p>
            <p className="zoj-break-anywhere mt-1 text-sm text-slate-600">
              {owner.email}
            </p>
            <p className="mt-4 text-xs leading-5 text-slate-600">
              일반 권한 변경이나 제거로는 총괄을 해제할 수 없습니다.
            </p>
          </div>
          {canTransfer ? (
            <div className="grid content-start gap-3">
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                총괄을 위임할 운영자
                <Select
                  aria-describedby={helpId}
                  className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-50"
                  value={email}
                  disabled={busy || candidates.length === 0}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setConfirmedEmail('');
                  }}
                >
                  <option value="">운영자 선택</option>
                  {candidates.map((operator) => (
                    <option key={operator.email} value={operator.email}>
                      {operator.display_name} /{' '}
                      {contestRoleTitleForAccount(operator, contestId)} ·{' '}
                      {operator.email}
                    </option>
                  ))}
                </Select>
              </label>
              <p id={helpId} className="text-sm leading-6 text-slate-600">
                {candidates.length
                  ? '선택한 운영자는 기존 담당 권한 대신 총괄 권한을 갖습니다. 위임한 본인은 대회 마스터로 남습니다.'
                  : '먼저 아래에서 위임할 운영자를 추가해 주세요.'}
              </p>
              {selected && confirmedEmail === email ? (
                <div
                  className="grid gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4"
                  role="region"
                  aria-label="총괄 위임 확인"
                >
                  <p className="zoj-break-anywhere text-sm leading-6 text-indigo-950">
                    <strong>
                      {selected.display_name} ({selected.email})
                    </strong>
                    님에게 총괄을 위임합니다. 이후 총괄 변경은 새 총괄만 할 수
                    있습니다.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      type="button"
                      disabled={busy}
                      onClick={() => onTransfer(email)}
                    >
                      {busy ? '위임 중…' : '총괄 위임 확정'}
                    </button>
                    <button
                      className="rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmedEmail('')}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-fit rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"
                  disabled={!selected || busy}
                  type="button"
                  onClick={() => setConfirmedEmail(email)}
                >
                  위임 내용 확인
                </button>
              )}
            </div>
          ) : (
            <p className="self-center text-sm leading-6 text-slate-600">
              총괄 위임은 현재 총괄 계정으로 로그인해 진행할 수 있습니다. 대회
              마스터의 일반 운영 권한은 동일하게 유지됩니다.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          등록된 총괄이 없습니다. 서비스 관리자가 첫 대회 마스터를 배정하면
          총괄로 등록됩니다.
        </p>
      )}
      {error ? (
        <p
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          role="alert"
        >
          {formatApiError(error, '총괄 위임에 실패했습니다')}
        </p>
      ) : null}
    </OperatorPanel>
  );
}
