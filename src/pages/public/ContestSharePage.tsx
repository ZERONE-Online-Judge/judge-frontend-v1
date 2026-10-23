import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import PageNotice from '@/shared/ui/PageNotice';
import { resolveContestShare } from '@/domains/contestAdministration/api';

export default function ContestSharePage() {
  const { code = '' } = useParams();
  const valid = /^[A-Za-z0-9_-]{11}$/.test(code);
  const link = useQuery({
    queryKey: ['contest-share', code],
    enabled: valid,
    queryFn: () => resolveContestShare(code),
    retry: false,
  });
  if (link.data?.contest_id) {
    return (
      <Navigate
        replace
        to={`/contests/${encodeURIComponent(link.data.contest_id)}`}
      />
    );
  }
  return (
    <main className="mx-auto grid max-w-3xl gap-4 px-6 py-16">
      {valid && link.isPending ? (
        <PageNotice message="대회로 이동하고 있습니다." status="loading" />
      ) : (
        <>
          <PageNotice
            message="공유 링크를 찾을 수 없습니다. 링크를 다시 확인해 주세요."
            status="error"
          />
          <Link
            className="text-sm text-indigo-600 underline underline-offset-4"
            to="/contests"
          >
            대회 목록으로
          </Link>
        </>
      )}
    </main>
  );
}
