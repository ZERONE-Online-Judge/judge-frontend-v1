import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AdminAccessGate, AdminLayout } from '@/components/admin/AdminShell';
import { getAdminMailUsage } from '@/domains/auditMonitoring/api';
import type {
  MailUsageQuota,
  MailUsageStatus,
} from '@/domains/auditMonitoring/types';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import './AdminMailPage.css';

const number = (value: number) => value.toLocaleString('ko-KR');
const koreanTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function timestamp(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return koreanTime.format(new Date(value));
}

function unavailable(status?: MailUsageStatus, message?: string | null) {
  if (message) return message;
  if (status === 'not_configured')
    return 'Resend API 키가 설정되어 있지 않습니다.';
  if (status === 'unsupported')
    return 'Resend를 사용하는 환경에서 조회할 수 있습니다.';
  return '집계를 확인할 수 없습니다. 잠시 후 다시 조회해 주세요.';
}

export default function AdminMailPage() {
  return (
    <AdminAccessGate>
      {(session) => <MailUsageContent token={session.accessToken} />}
    </AdminAccessGate>
  );
}

function MailUsageContent({ token }: { token: string }) {
  const visible = useDocumentVisibility();
  const query = useQuery({
    queryKey: ['admin', 'mail-usage', tokenQueryIdentity(token)],
    queryFn: () => getAdminMailUsage(token),
    staleTime: 60_000,
    refetchInterval: visible ? 60_000 : false,
    retry: false,
  });
  const report = query.data;
  const weekly = report?.weekly;
  const start = timestamp(weekly?.start_at);
  const end = timestamp(weekly?.end_at);
  const weeklyReady = weekly?.status === 'ok' && weekly.sent !== null;
  return (
    <AdminLayout
      title="메일 발송량"
      description="Resend 계정의 발송량과 사용 한도를 확인합니다."
      actions={
        <button
          className="admin-action"
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? '조회 중…' : '새로고침'}
        </button>
      }
    >
      <div className="admin-mail-context">
        <span className="admin-mail-provider">Resend 계정 전체</span>
        <span>
          {report
            ? `조회 시각 ${timestamp(report.generated_at) ?? '확인 불가'} (KST)`
            : '발송량을 불러오는 중입니다.'}
        </span>
      </div>
      {query.isError ? (
        <p role="alert" className="admin-mail-alert">
          {report
            ? '집계를 갱신하지 못했습니다. 아래는 이전 조회 결과입니다.'
            : '메일 발송량을 조회하지 못했습니다. 새로고침으로 다시 시도해 주세요.'}
        </p>
      ) : null}
      <div className="admin-mail-grid" aria-busy={query.isFetching}>
        <QuotaCard
          title="일간 발송"
          label="일간 발송량"
          quota={report?.quota.daily}
          loading={query.isPending}
          message={unavailable(report?.quota.status, report?.quota.message)}
        />
        <article className="admin-mail-card" aria-label="주간 발송량">
          <h2>최근 7일 발송</h2>
          <p className="admin-mail-count">
            <span className="admin-mail-count-label">발송</span>
            <strong>{weeklyReady ? number(weekly.sent!) : '—'}</strong>
            {weeklyReady ? <span>건</span> : null}
          </p>
          <div className="admin-mail-card-detail">
            {weeklyReady ? (
              <>
                <p className="admin-mail-weekly-limit">별도 주간 한도 없음</p>
                <p>일간·월간 사용 한도가 적용됩니다.</p>
                {start && end ? (
                  <p className="admin-mail-period">
                    {start}
                    <br />~ {end} (KST)
                  </p>
                ) : null}
              </>
            ) : (
              <p>
                {query.isPending
                  ? '집계를 불러오는 중입니다.'
                  : unavailable(weekly?.status, weekly?.message)}
              </p>
            )}
          </div>
        </article>
        <QuotaCard
          title="월간 발송"
          label="월간 발송량"
          quota={report?.quota.monthly}
          loading={query.isPending}
          message={unavailable(report?.quota.status, report?.quota.message)}
        />
      </div>
      <div className="admin-mail-notes">
        <div>
          <p>
            한도 사용량은 발송·수신을 합친 건수입니다. 여러 수신자에게 보낸
            메일은 수신자별로 집계됩니다.
          </p>
          <p>
            발송량은 수신 서버로 보낸 건수이며, 받은편지함 도착 여부와는
            다릅니다. 최근 7일 집계는 최대 {report?.metrics_delay_minutes ?? 15}
            분 늦게 반영될 수 있습니다.
          </p>
          <p>
            1분 간격으로 조회하며, 초기화 시각은 Resend에서 제공하는 계정
            기준입니다.
          </p>
        </div>
        <Link className="admin-action" to="/admin/audit-logs?view=email">
          이메일 발송 기록 →
        </Link>
      </div>
    </AdminLayout>
  );
}

function QuotaCard({
  title,
  label,
  quota,
  loading,
  message,
}: {
  title: string;
  label: string;
  quota?: MailUsageQuota | null;
  loading: boolean;
  message: string;
}) {
  const reset = timestamp(quota?.resets_at);
  const limit = quota?.limit;
  const fraction =
    quota && typeof limit === 'number' && limit > 0
      ? Math.min(100, (quota.used / limit) * 100)
      : 0;
  const reached = quota && typeof limit === 'number' && quota.used >= limit;
  return (
    <article
      className={`admin-mail-card${reached ? 'is-at-limit' : ''}`}
      aria-label={label}
    >
      <h2>{title}</h2>
      <p className="admin-mail-count">
        <span className="admin-mail-count-label">발송</span>
        <strong>{quota ? number(quota.sent) : '—'}</strong>
        {quota ? <span>건</span> : null}
      </p>
      <div className="admin-mail-card-detail">
        {quota ? (
          <>
            <p className="admin-mail-quota">
              <span>
                사용량 <strong>{number(quota.used)}건</strong>
              </span>
              <span>
                한도{' '}
                <strong>
                  {limit === null ? '무제한' : `${number(limit!)}건`}
                </strong>
              </span>
            </p>
            {typeof limit === 'number' ? (
              <>
                <div
                  className="admin-mail-meter"
                  role="meter"
                  aria-label={`${title} 한도 사용률`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(fraction)}
                  aria-valuetext={`${number(quota.used)}건 / ${number(limit)}건`}
                >
                  <span style={{ width: `${fraction}%` }} />
                </div>
                <p className="admin-mail-remaining">
                  {reached
                    ? '사용 한도 도달'
                    : `${number(Math.max(0, limit - quota.used))}건 남음`}
                </p>
              </>
            ) : null}
            {quota.received > 0 ? (
              <p>수신 {number(quota.received)}건 포함</p>
            ) : null}
            <p className="admin-mail-reset">
              {reset ? `다음 초기화 ${reset} (KST)` : '초기화 시각 정보 없음'}
            </p>
          </>
        ) : (
          <p>{loading ? '집계를 불러오는 중입니다.' : message}</p>
        )}
      </div>
    </article>
  );
}
