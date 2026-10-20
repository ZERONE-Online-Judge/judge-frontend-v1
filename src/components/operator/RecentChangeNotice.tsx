import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { listOperatorContestNotices } from '@/domains/serviceCommunication/api';
import type { ContestNotice } from '@/domains/serviceCommunication/types';
import { formatApiError } from '@/shared/api/errors';
import {
  currentSavedChangeNotice,
  subscribeChangeNotice,
} from '@/shared/api/changeNotice';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import { formatDateTime } from '@/shared/lib/dateTime';
import ChangeNoticeContent from '@/components/operator/ChangeNoticeContent';

export default function RecentChangeNotice({
  contestId,
  token,
}: {
  contestId: string;
  token: string;
}) {
  const [open, setOpen] = useState(false);
  const identity = tokenQueryIdentity(token);
  const queryClient = useQueryClient();
  const saved = useSyncExternalStore(
    subscribeChangeNotice,
    currentSavedChangeNotice,
    () => null,
  );
  const query = useQuery({
    queryKey: ['operator', 'notices', contestId, identity],
    queryFn: () => listOperatorContestNotices(contestId, token),
    refetchInterval: 15_000,
  });
  useEffect(() => {
    if (saved?.identity !== identity || saved.notice.contest_id !== contestId)
      return;
    void queryClient.invalidateQueries({
      queryKey: ['operator', 'notices', contestId, identity],
    });
  }, [saved, identity, contestId, queryClient]);
  const notice = (query.data ?? [])
    .filter((item) => item.emergency && item.body.includes('\n\n변경 사유: '))
    .sort(
      (a: ContestNotice, b: ContestNotice) =>
        Date.parse(b.published_at) - Date.parse(a.published_at),
    )[0];
  if (!notice && !query.error) return null;
  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            void query.refetch();
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          변경 공지 보기
        </button>
      </div>
      {open ? (
        <ModalDialog
          title="변경 공지"
          size="md"
          onClose={() => setOpen(false)}
          footer={
            <ModalButton onClick={() => setOpen(false)}>닫기</ModalButton>
          }
        >
          {notice ? (
            <>
              <p className="mb-3 text-xs text-slate-500">
                {formatDateTime(notice.published_at)}
              </p>
              <ChangeNoticeContent title={notice.title} body={notice.body} />
            </>
          ) : (
            <p className="text-sm text-slate-600">
              {formatApiError(query.error, '공지를 불러오지 못했습니다.')}
            </p>
          )}
        </ModalDialog>
      ) : null}
    </>
  );
}
