import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/shared/api/client';
import { downloadPackageBackup } from '@/domains/problemManagement/packageBackups';
import { formatApiError } from '@/shared/api/errors';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';

export default function PackageUpdateHistory({
  contestId,
  problemId,
  token,
}: {
  contestId: string;
  problemId: string;
  token: string;
}) {
  const history = useQuery({
    queryKey: [
      'package-updates',
      contestId,
      problemId,
      tokenQueryIdentity(token),
    ],
    queryFn: () =>
      apiRequest<
        {
          id: string;
          created_at: string;
          actor_name: string;
          reason: string;
          backup_url: string;
        }[]
      >(
        `/operator/contests/${contestId}/problems/${problemId}/package-updates`,
        token,
      ),
    staleTime: 0,
  });
  const backup = useMutation({
    mutationFn: (url: string) => downloadPackageBackup(url, token),
  });
  if (!history.data?.length) return null;
  return (
    <details className="border-t border-slate-200 pt-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
        패키지 업데이트 기록 · 이전 백업 {history.data.length}개
      </summary>
      <ul className="mt-3 grid max-h-64 gap-3 overflow-y-auto text-xs">
        {history.data.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              {new Date(row.created_at).toLocaleString('ko-KR')} ·{' '}
              {row.actor_name}
              <span className="mt-1 block break-words text-slate-500">
                {row.reason}
              </span>
            </span>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-50"
              disabled={backup.isPending}
              onClick={() => backup.mutate(row.backup_url)}
            >
              이전 패키지 다운로드
            </button>
          </li>
        ))}
      </ul>
      {backup.error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {formatApiError(backup.error, '백업을 다운로드하지 못했습니다.')}
        </p>
      )}
    </details>
  );
}
