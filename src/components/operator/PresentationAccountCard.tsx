import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ManagementPanel } from '@/components/common/ManagementCards';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import {
  getPresentationAccount,
  issuePresentationAccount,
  revokePresentationAccount,
} from '@/domains/presentationAccess/api';
import { presentationLoginUrl } from '@/domains/presentationAccess/loginLink';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatDateTime } from '@/shared/lib/dateTime';
import { formatApiError } from '@/shared/api/errors';
import { ModalButton } from '@/shared/ui/ModalDialog';
import useConfirmation from '@/shared/ui/useConfirmation';

type PresentationViewProps = {
  contestId: string;
  token: string;
  canManage: boolean;
  onOpenPopup: () => void;
  popupDisabled: boolean;
  popupBlocked: boolean;
  popupUrl: string;
  divisionIds: string[];
};

function accountLoginUrl(
  contestId: string,
  email: string,
  divisionIds: string[],
) {
  try {
    return presentationLoginUrl(contestId, email, divisionIds);
  } catch {
    return '';
  }
}

export default function PresentationAccountCard({
  contestId,
  token,
  canManage,
  onOpenPopup,
  popupDisabled,
  popupBlocked,
  popupUrl,
  divisionIds,
}: PresentationViewProps) {
  return (
    <ManagementPanel
      title="프레젠테이션 뷰"
      description={
        canManage
          ? '이 기기에서 팝업을 열거나 자동 로그인 링크로 발표용 기기를 연결하세요.'
          : '별도 창에서 발표 화면을 엽니다. 표시할 유형을 선택할 수 있습니다.'
      }
      actions={
        <ModalButton
          tone="primary"
          disabled={popupDisabled}
          onClick={onOpenPopup}
        >
          <InterfaceIcon name="arrowUpRight" size={16} className="mr-1.5" />
          프레젠테이션 팝업
        </ModalButton>
      }
    >
      <div className="grid min-w-0 gap-4">
        {popupBlocked ? (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            브라우저에서 팝업이 차단되었습니다. 팝업을 허용하거나{' '}
            <a
              className="font-medium underline underline-offset-4"
              href={popupUrl}
              target="_blank"
              rel="noreferrer"
            >
              새 탭에서 프레젠테이션 열기
            </a>
            를 선택하세요.
          </p>
        ) : null}
        {canManage ? (
          <ManagedPresentationAccount
            contestId={contestId}
            token={token}
            divisionIds={divisionIds}
            selectionPending={popupDisabled}
          />
        ) : null}
      </div>
    </ManagementPanel>
  );
}

function ManagedPresentationAccount({
  contestId,
  token,
  divisionIds,
  selectionPending,
}: {
  contestId: string;
  token: string;
  divisionIds: string[];
  selectionPending: boolean;
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
  const [copyState, setCopyState] = useState<{
    url: string;
    manual: boolean;
    message: string;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: async (action: 'issue' | 'revoke') => {
      if (action === 'issue') return issuePresentationAccount(contestId, token);
      await revokePresentationAccount(contestId, token);
      return null;
    },
    onSuccess: (account) => {
      client.setQueryData(queryKey, account);
      setCopyState(null);
    },
  });
  const account = accountQuery.data;
  const loginUrl = account
    ? accountLoginUrl(contestId, account.email, divisionIds)
    : '';
  const currentCopy = copyState?.url === loginUrl ? copyState : null;
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
      <div className="grid min-w-0 gap-4">
        {account ? (
          <div className="zoj-inset grid min-w-0 gap-4 p-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-medium text-slate-500">
                  발표용 전용 계정 · {account.active ? '사용 가능' : '만료됨'}
                </p>
                <code
                  className="block text-base font-semibold break-all text-indigo-700"
                  aria-label="프레젠테이션 로그인 계정"
                >
                  {account.email}
                </code>
                <p className="mt-2 text-xs text-slate-500">
                  유효기간: {formatDateTime(account.expires_at)}까지
                </p>
              </div>
              <ModalButton
                disabled={
                  busy || selectionPending || !account.active || !loginUrl
                }
                onClick={async () => {
                  if (!loginUrl) return;
                  try {
                    await navigator.clipboard.writeText(loginUrl);
                    setCopyState({
                      url: loginUrl,
                      manual: false,
                      message: '자동 로그인 링크를 복사했습니다.',
                    });
                  } catch {
                    setCopyState({
                      url: loginUrl,
                      manual: true,
                      message: '아래 링크를 선택하여 직접 복사해 주세요.',
                    });
                  }
                }}
              >
                자동 로그인 링크 복사
              </ModalButton>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              링크를 열면 인증번호 없이 발표 화면에 연결됩니다. 직접 로그인할
              때는 위 계정을 입력하세요.
            </p>
            {!loginUrl ? (
              <p role="alert" className="text-xs text-amber-700">
                자동 로그인 링크를 만들지 못했습니다. 위 계정으로 직접
                로그인하거나 계정을 재발급해 주세요.
              </p>
            ) : null}
            {currentCopy ? (
              <p role="status" className="text-xs text-indigo-700">
                {currentCopy.message}
              </p>
            ) : null}
            {currentCopy?.manual ? (
              <label className="grid min-w-0 gap-2 text-xs font-medium text-slate-600">
                자동 로그인 링크
                <input
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700"
                  readOnly
                  value={loginUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {accountQuery.isPending
              ? '계정을 확인하고 있습니다.'
              : '다른 기기를 연결하려면 발표용 전용 계정을 만들어 주세요.'}
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
        </div>
        <p className="text-xs leading-5 text-slate-500">
          발급 후 7일 동안 여러 기기에서 동시에 사용할 수 있습니다. 링크와
          계정은 발표 담당자에게만 전달해 주세요. 재발급하거나 사용 중지하면
          모든 연결이 종료됩니다.
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
      {dialog}
    </>
  );
}
