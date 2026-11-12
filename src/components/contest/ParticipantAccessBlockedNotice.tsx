import { Link } from 'react-router-dom';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import type { ApiClientError } from '@/shared/api/errors';

export default function ParticipantAccessBlockedNotice({
  error,
  checking,
  onRetry,
}: {
  error: ApiClientError;
  checking: boolean;
  onRetry: () => void;
}) {
  const reason =
    typeof error.details?.reason === 'string'
      ? error.details.reason.trim()
      : '';
  return (
    <div className="mx-auto grid w-full max-w-xl gap-5 rounded-2xl border border-rose-100 bg-white p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          <InterfaceIcon name="alert" size={22} />
        </span>
        <div className="grid min-w-0 gap-2" role="status">
          <h1 className="text-xl font-bold tracking-tight text-slate-950">
            대회 접근이 차단되었습니다
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            운영진이{' '}
            {error.details?.scope === 'team' ? '소속 팀의' : '회원님의'} 이 대회
            접근을 차단했습니다. 문제 열람과 제출 등 대회 기능을 이용할 수
            없습니다.
          </p>
        </div>
      </div>
      {reason ? (
        <div className="grid min-w-0 gap-1 rounded-xl bg-rose-50 p-4">
          <p className="text-xs font-semibold text-rose-800">차단 사유</p>
          <p className="zoj-break-anywhere text-sm leading-6 whitespace-pre-wrap text-rose-900">
            {reason}
          </p>
        </div>
      ) : null}
      <p className="text-sm leading-6 text-slate-600">
        자세한 내용은 대회 운영진에게 문의해 주세요. 계정 로그인은 유지되며,
        운영진이 차단을 해제하면 다시 이용할 수 있습니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          type="button"
          disabled={checking}
          onClick={onRetry}
        >
          {checking ? '접근 상태 확인 중…' : '접근 상태 다시 확인'}
        </button>
        <Link
          className="flex min-h-11 items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          to="/contests"
        >
          대회 목록으로
        </Link>
      </div>
    </div>
  );
}
