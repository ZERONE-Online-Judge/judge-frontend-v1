import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ManagementPanel } from '@/components/common/ManagementCards';
import {
  getPresentationAccount,
  issuePresentationAccount,
  revokePresentationAccount,
} from '@/domains/presentationAccess/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatDateTime } from '@/shared/lib/dateTime';
import { formatApiError } from '@/shared/api/errors';
import { ModalButton } from '@/shared/ui/ModalDialog';
import useConfirmation from '@/shared/ui/useConfirmation';

export default function PresentationAccountCard({
  contestId,
  token,
}: {
  contestId: string;
  token: string;
}) {
  const client = useQueryClient();
  const queryKey = [
    'operator',
    'presentation-account',
    contestId,
    tokenQueryIdentity(token),
  ];
  const accountQuery = useQuery({
    queryKey,
    queryFn: () => getPresentationAccount(contestId, token),
  });
  const { confirm, dialog } = useConfirmation();
  const [copyMessage, setCopyMessage] = useState('');
  const mutation = useMutation({
    mutationFn: async (action: 'issue' | 'revoke') => {
      if (action === 'issue') return issuePresentationAccount(contestId, token);
      await revokePresentationAccount(contestId, token);
      return null;
    },
    onSuccess: (account) => {
      client.setQueryData(queryKey, account);
      setCopyMessage('');
    },
  });
  const account = accountQuery.data;
  const busy = mutation.isPending || accountQuery.isPending;
  async function act(action: 'issue' | 'revoke') {
    if (busy) return;
    if (
      account &&
      !(await confirm(
        action === 'issue'
          ? '새 주소를 만들면 기존 주소와 발표 화면의 로그인 연결이 즉시 해제됩니다.'
          : '이 주소로 로그인할 수 없게 되며, 연결된 발표 화면도 종료됩니다.',
        {
          title:
            action === 'issue'
              ? '프레젠테이션 계정 재발급'
              : '프레젠테이션 계정 사용 중지',
          confirmLabel: action === 'issue' ? '재발급' : '사용 중지',
        },
      ))
    )
      return;
    mutation.mutate(action);
  }
  return (
    <>
      <ManagementPanel
        title="프레젠테이션 전용 계정"
        description="발표용 기기에서 이 주소로 로그인하면 인증번호 없이 이 대회의 프레젠테이션만 열립니다."
      >
        <div className="grid gap-4">
          {account ? (
            <div className="zoj-inset flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-slate-500">
                  발표용 로그인 주소 · {account.active ? '사용 가능' : '만료됨'}
                </p>
                <code
                  className="block text-lg font-semibold break-all text-indigo-700"
                  aria-label="프레젠테이션 로그인 주소"
                >
                  {account.email}
                </code>
                <p className="mt-2 text-xs text-slate-500">
                  유효기간: {formatDateTime(account.expires_at)}까지
                </p>
              </div>
              <ModalButton
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(account.email);
                    setCopyMessage('로그인 주소를 복사했습니다.');
                  } catch {
                    setCopyMessage('주소를 선택하여 직접 복사해 주세요.');
                  }
                }}
              >
                주소 복사
              </ModalButton>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {accountQuery.isPending
                ? '계정을 확인하고 있습니다.'
                : '발표용 기기에서 사용할 짧은 로그인 주소를 만듭니다.'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <ModalButton
              tone="primary"
              disabled={busy || Boolean(accountQuery.error)}
              onClick={() => void act('issue')}
            >
              {mutation.isPending
                ? '처리 중…'
                : account
                  ? '새 주소로 재발급'
                  : '전용 계정 만들기'}
            </ModalButton>
            {account ? (
              <ModalButton disabled={busy} onClick={() => void act('revoke')}>
                사용 중지
              </ModalButton>
            ) : null}
            {copyMessage ? (
              <p role="status" className="text-xs text-indigo-700">
                {copyMessage}
              </p>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-slate-500">
            발급 후 7일 동안 유효합니다. 이 주소를 아는 사람은 발표 화면을 볼 수
            있으므로 발표 담당자에게만 전달해 주세요. 여러 기기에서 동시에
            사용할 수 있습니다. 재발급하거나 사용 중지하면 모든 연결이
            종료됩니다.
          </p>
          {accountQuery.error || mutation.error ? (
            <p role="alert" className="text-sm text-rose-700">
              {formatApiError(
                accountQuery.error || mutation.error,
                '전용 계정을 처리하지 못했습니다',
              )}
            </p>
          ) : null}
        </div>
      </ManagementPanel>
      {dialog}
    </>
  );
}
