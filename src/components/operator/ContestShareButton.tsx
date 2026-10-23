import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createContestShareLink } from '@/domains/contestAdministration/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';

export default function ContestShareButton({
  contestId,
  token,
}: {
  contestId: string;
  token: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const inputId = useId();
  const share = useQuery({
    queryKey: [
      'operator',
      'contest-share',
      contestId,
      tokenQueryIdentity(token),
    ],
    enabled: open,
    queryFn: () => createContestShareLink(contestId, token),
    staleTime: Infinity,
    retry: false,
  });
  const url = share.data?.code
    ? new URL(
        `/share/${encodeURIComponent(share.data.code)}`,
        window.location.origin,
      ).href
    : '';

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage('대회 링크를 복사했습니다. 참가자에게 전달해 주세요.');
    } catch {
      setMessage('복사하지 못했습니다. 아래 링크를 선택해 직접 복사해 주세요.');
    }
  }

  return (
    <>
      <button
        type="button"
        className="operator-preview-link operator-share-link"
        aria-label="대회 링크 공유"
        title="대회 링크 공유"
        onClick={() => {
          setMessage('');
          setOpen(true);
        }}
      >
        <span>대회 링크 공유</span>
        <InterfaceIcon name="link" />
      </button>
      {open ? (
        <ModalDialog
          title="참가자용 대회 링크"
          description="참가자에게 이 링크를 전달해 주세요."
          icon={<InterfaceIcon name="link" />}
          onClose={() => setOpen(false)}
          footer={
            <>
              {url ? (
                <a
                  className="zoj-modal-action"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  대회 열기
                </a>
              ) : null}
              <ModalButton
                tone="primary"
                disabled={!url}
                onClick={() => void copyLink()}
              >
                링크 복사
              </ModalButton>
            </>
          }
        >
          {share.isError ? (
            <p role="alert" className="mb-3 text-sm text-red-600">
              링크를 불러오지 못했습니다.{' '}
              <button
                type="button"
                className="underline"
                onClick={() => void share.refetch()}
              >
                다시 시도
              </button>
            </p>
          ) : null}
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor={inputId}
          >
            대회 링크
          </label>
          <input
            id={inputId}
            className="mt-2 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
            readOnly
            value={url}
            placeholder="공유 링크를 준비하고 있습니다."
            onFocus={(event) => event.currentTarget.select()}
          />
          <p className="zoj-modal-copy mt-3">
            참가자로 등록된 이메일로 로그인해 주세요.
          </p>
          <p
            className="mt-3 text-sm text-slate-600"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        </ModalDialog>
      ) : null}
    </>
  );
}
