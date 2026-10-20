import { useId, useState, useSyncExternalStore } from 'react';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import {
  currentChangeNotice,
  finishChangeNotice,
  subscribeChangeNotice,
  type ChangeNoticeDraft,
} from '@/shared/api/changeNotice';

export default function ChangeNoticeDialog() {
  const pending = useSyncExternalStore(
    subscribeChangeNotice,
    currentChangeNotice,
    () => null,
  );
  return pending ? (
    <NoticeForm key={pending.id} id={pending.id} draft={pending.draft} />
  ) : null;
}

function NoticeForm({ id, draft }: { id: number; draft: ChangeNoticeDraft }) {
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [reason, setReason] = useState(draft.reason ?? '');
  const formId = useId();
  const cancel = () => finishChangeNotice(id, null);
  return (
    <ModalDialog
      title="변경 공지 확인"
      description="참가자에게 공지가 필요한 변경입니다. 사유를 입력하면 변경사항과 긴급공지가 함께 저장됩니다."
      size="md"
      closeOnBackdrop={false}
      onClose={cancel}
      footer={
        <>
          <ModalButton onClick={cancel}>취소</ModalButton>
          <ModalButton
            type="submit"
            form={formId}
            tone="primary"
            disabled={!title.trim() || !body.trim() || !reason.trim()}
          >
            변경 및 공지 등록
          </ModalButton>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim() && body.trim() && reason.trim())
            finishChangeNotice(id, {
              ...draft,
              title: title.trim(),
              body: body.trim(),
              reason: reason.trim(),
            });
        }}
      >
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          공지 제목
          <input
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          변경 내용
          <textarea
            required
            maxLength={20000}
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 leading-6 font-normal"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          변경 사유
          <textarea
            required
            maxLength={2000}
            rows={2}
            placeholder="변경한 이유를 입력하세요."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 leading-6 font-normal"
          />
        </label>
      </form>
    </ModalDialog>
  );
}
