import Select from '@/shared/ui/Select';
import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AdminAccessGate,
  AdminMetricCard,
  AdminPanel,
  AdminLayout,
  AnalyticsIcon,
  ContestIcon,
  JudgeIcon,
} from '@/components/admin/AdminShell';
import { getAdminContests } from '@/domains/contestAdministration/api';
import { getUsageReport } from '@/domains/usageAnalytics/api';
import {
  comparison,
  dateRange,
  duration,
  koreaDate,
  usageCsv,
} from '@/domains/usageAnalytics/format';
import type {
  UsageBreakdown,
  UsageFilters,
  UsageReport,
} from '@/domains/usageAnalytics/types';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { judgeLanguageLabel } from '@/domains/submissionScoreboard/languageLabel';
import { formatApiError } from '@/shared/api/errors';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import './AdminAnalyticsPage.css';

const number = (value: number) => value.toLocaleString('ko-KR');
const audienceOptions = [
  ['all', '전체 이용자'],
  ['visitors', '일반 이용자'],
  ['staff', '운영진·서비스 관리자'],
  ['anonymous', '비로그인'],
  ['signed_in', '로그인한 이용자'],
];
const serviceOptions = [
  ['', '전체 서비스'],
  ['public', '공개 서비스'],
  ['contest', '대회 참가 화면'],
  ['operator', '대회 운영 화면'],
  ['admin', '서비스 관리'],
];
const outcomeLabels: Record<string, string> = {
  accepted: '맞았습니다',
  wrong_answer: '틀렸습니다',
  compile_error: '컴파일 에러',
  runtime_error: '런타임 에러',
  time_limit_exceeded: '시간 초과',
  memory_limit_exceeded: '메모리 초과',
  output_limit_exceeded: '출력 초과',
  system_error: '채점 시스템 오류',
  waiting: '대기',
  preparing: '준비 중',
  judging: '채점 중',
};
const kindLabels: Record<string, string> = {
  participant: '참가자 제출',
  operator_test: '운영자 검증',
  participant_preview: '참가자 미리보기',
  mock_judging: '모의채점',
};

export default function AdminAnalyticsPage() {
  return (
    <AdminAccessGate>
      {(session) => <AnalyticsContent token={session.accessToken} />}
    </AdminAccessGate>
  );
}
function AnalyticsContent({ token }: { token: string }) {
  const [filters, setFilters] = useState<UsageFilters>(() => ({
    ...dateRange(7),
    contest_id: '',
    service: '',
    audience: 'all',
  }));
  const [draft, setDraft] = useState(filters);
  const [formError, setFormError] = useState('');
  const visible = useDocumentVisibility();
  const identity = tokenQueryIdentity(token);
  const reportQuery = useQuery({
    queryKey: ['admin', 'analytics', filters, identity],
    queryFn: () => getUsageReport(token, filters),
    refetchInterval: visible ? 60_000 : false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const contestsQuery = useQuery({
    queryKey: ['admin', 'contests', identity],
    queryFn: () => getAdminContests(token),
    staleTime: 60_000,
  });
  const report = reportQuery.data;
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const days = (Date.parse(draft.end) - Date.parse(draft.start)) / 86400000;
    if (
      !draft.start ||
      !draft.end ||
      days < 0 ||
      days >= 366 ||
      draft.end > koreaDate()
    ) {
      setFormError(
        '시작일과 종료일을 확인해 주세요. 최대 366일까지 조회할 수 있습니다.',
      );
      return;
    }
    setFormError('');
    setFilters({ ...draft });
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([usageCsv(report)], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `zoj-운영통계-${report.period.start}-${report.period.end}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function selectContest(contestId: string) {
    const next = { ...filters, contest_id: contestId };
    setDraft(next);
    setFilters(next);
  }
  return (
    <AdminLayout
      title="운영 통계"
      description="방문 추이와 대회별 이용 현황을 조회합니다."
    >
      <section className="admin-analytics-summary">
        <div>
          <h2>방문·이용 현황</h2>
          <p>
            {report
              ? `${report.period.start} ~ ${report.period.end} · 한국시간 기준`
              : '조회 기간의 이용 현황을 불러오는 중입니다.'}
          </p>
        </div>
        <div>
          <span>최근 5분 방문자</span>
          <strong>
            {report ? number(report.summary.active_visitors) : '—'}
            <small>명</small>
          </strong>
          <p>선택한 대회·서비스·이용자 기준</p>
        </div>
      </section>
      <AdminPanel
        title="조회 범위"
        description="모든 날짜와 시각은 한국시간(KST) 기준입니다. 일반 이용자는 비로그인·일반 회원·참가자를 포함합니다."
        actions={
          <button
            className="analytics-button"
            onClick={download}
            disabled={!report || reportQuery.isFetching}
            type="button"
          >
            CSV 내려받기
          </button>
        }
      >
        <form onSubmit={apply} className="analytics-filters">
          <div className="analytics-presets">
            {[
              [1, '오늘'],
              [7, '최근 7일'],
              [30, '최근 30일'],
              [90, '최근 90일'],
            ].map(([days, label]) => (
              <button
                key={days}
                className="analytics-button"
                type="button"
                onClick={() => {
                  const next = { ...filters, ...dateRange(Number(days)) };
                  setDraft(next);
                  setFilters(next);
                  setFormError('');
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="analytics-filter-grid">
            <label>
              시작일
              <input
                type="date"
                required
                max={koreaDate()}
                value={draft.start}
                onChange={(event) =>
                  setDraft({ ...draft, start: event.target.value })
                }
              />
            </label>
            <label>
              종료일
              <input
                type="date"
                required
                min={draft.start}
                max={koreaDate()}
                value={draft.end}
                onChange={(event) =>
                  setDraft({ ...draft, end: event.target.value })
                }
              />
            </label>
            <label>
              대회
              <Select
                aria-label="대회"
                value={draft.contest_id}
                onChange={(event) =>
                  setDraft({ ...draft, contest_id: event.target.value })
                }
              >
                <option value="">전체 대회</option>
                {(contestsQuery.data ?? []).map((contest) => (
                  <option key={contest.contest_id} value={contest.contest_id}>
                    {contest.title}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              서비스
              <Select
                aria-label="서비스"
                value={draft.service}
                onChange={(event) =>
                  setDraft({ ...draft, service: event.target.value })
                }
              >
                {serviceOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              이용자
              <Select
                aria-label="이용자"
                value={draft.audience}
                onChange={(event) =>
                  setDraft({ ...draft, audience: event.target.value })
                }
              >
                {audienceOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <button
              className="analytics-button is-primary"
              type="submit"
              disabled={reportQuery.isFetching}
            >
              조회하기
            </button>
          </div>
          {formError ? (
            <p className="analytics-error" role="alert">
              {formError}
            </p>
          ) : null}
        </form>
        <div className="analytics-refresh">
          <span>
            {report
              ? `${report.period.start} ~ ${report.period.end} · 마지막 갱신 ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(report.generated_at))}`
              : '통계를 불러오는 중입니다.'}
          </span>
          <button
            className="analytics-text-button"
            type="button"
            onClick={() => void reportQuery.refetch()}
            disabled={reportQuery.isFetching}
          >
            {reportQuery.isFetching ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      </AdminPanel>
      {reportQuery.error ? (
        <div className="analytics-error" role="alert">
          {formatApiError(
            reportQuery.error,
            '통계를 불러오지 못했습니다. 다시 시도해 주세요.',
          )}
        </div>
      ) : null}
      {contestsQuery.error ? (
        <p className="analytics-error" role="alert">
          대회 목록을 불러오지 못했습니다. 전체 통계는 조회할 수 있습니다.
        </p>
      ) : null}
      {!report && reportQuery.isPending ? (
        <div className="analytics-loading" role="status">
          방문 흐름을 정리하고 있어요…
        </div>
      ) : null}
      {report ? (
        <>
          <div className="analytics-note" role="note">
            {report.first_event_at
              ? `페이지 방문 통계는 ${koreaDate(new Date(report.first_event_at))}부터 남아 있는 기록으로 집계합니다.`
              : '수집된 방문 기록이 없습니다. 통계 수집이 시작된 이후의 방문만 표시합니다.'}{' '}
            상세 기록은 {report.retention_days}일 보관합니다. 브라우저의 추적
            차단 등에 따라 실제 이용량과 차이가 있을 수 있습니다.
          </div>
          <div className="analytics-metrics">
            <AdminMetricCard
              icon={<AnalyticsIcon />}
              label="페이지 조회"
              value={`${number(report.summary.views)}회`}
              description={comparison(
                report.summary.views,
                report.previous.views,
                report.comparison_available,
              )}
            />
            <AdminMetricCard
              icon={<ContestIcon />}
              accent="emerald"
              label="방문자"
              value={`${number(report.summary.visitors)}명`}
              description="브라우저의 익명 식별자 기준으로 중복을 제거했어요."
            />
            <AdminMetricCard
              icon={<AnalyticsIcon />}
              accent="amber"
              label="방문 세션"
              value={`${number(report.summary.visits)}회`}
              description="탭별 방문을 집계하고, 30분간 비활성 후 다시 방문하면 새로 셉니다."
            />
            <AdminMetricCard
              icon={<JudgeIcon />}
              accent="slate"
              label="평균 화면 이용시간"
              value={duration(report.summary.average_active_seconds)}
              description="화면이 보이는 동안 측정한 시간 / 페이지 조회"
            />
          </div>
          <div className="analytics-mini-metrics">
            <span>
              로그인 계정{' '}
              <strong>{number(report.summary.signed_in_users)}명</strong>
            </span>
            <span>
              기간 내 첫 방문{' '}
              <strong>{number(report.summary.new_visitors)}명</strong>
            </span>
            <span>
              이전 방문 기록 있음{' '}
              <strong>{number(report.summary.returning_visitors)}명</strong>
            </span>
          </div>
          <AdminPanel
            title={
              report.period.interval === 'hour'
                ? '시간별 방문 추이'
                : '날짜별 방문 추이'
            }
            description="페이지 조회와 방문자를 함께 비교하세요. 그래프에 마우스를 올리거나 키보드로 이동하면 수치를 확인할 수 있습니다."
          >
            <Timeline report={report} />
          </AdminPanel>
          <div className="analytics-two-columns">
            <AdminPanel
              title="언제 가장 많이 찾아올까요?"
              description="선택 기간의 시간대별 페이지 조회를 합산했습니다."
            >
              <HourChart rows={report.hours} />
            </AdminPanel>
            <AdminPanel
              title="요일 × 시간대"
              description="색이 진할수록 방문이 많아요. 운영 인력을 배치할 시간을 살펴보세요."
            >
              <Heatmap rows={report.heatmap} />
            </AdminPanel>
          </div>
          <div className="analytics-two-columns">
            <AdminPanel
              title="대회별 이용 현황"
              description="페이지 조회 상위 30개 대회입니다. 대회명을 누르면 해당 대회로 조회 범위를 좁힙니다."
            >
              {report.contests.length ? (
                <div className="analytics-table-scroll">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>대회</th>
                        <th>조회</th>
                        <th>방문자</th>
                        <th>방문 세션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.contests.map((contest) => (
                        <tr key={contest.contest_id}>
                          <th>
                            <button
                              className="analytics-text-button"
                              onClick={() => selectContest(contest.contest_id)}
                            >
                              {contest.title}
                            </button>
                          </th>
                          <td>{number(contest.views)}</td>
                          <td>{number(contest.visitors)}</td>
                          <td>{number(contest.visits)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty />
              )}
            </AdminPanel>
            <AdminPanel
              title="많이 이용한 화면"
              description="서비스 전체 또는 선택한 대회의 화면별 페이지 조회 상위 30개입니다."
            >
              <Breakdown rows={report.pages} total={report.summary.views} />
            </AdminPanel>
          </div>
          <div className="analytics-three-columns">
            <AdminPanel title="서비스별 방문">
              <Breakdown rows={report.services} total={report.summary.views} />
            </AdminPanel>
            <AdminPanel title="어떤 사람들이 이용할까요?">
              <Breakdown rows={report.audiences} total={report.summary.views} />
            </AdminPanel>
            <AdminPanel
              title="어디에서 찾아왔을까요?"
              description="외부 주소는 출처 종류만 분류합니다. 검색어와 상세 주소는 저장하지 않습니다."
            >
              <Breakdown rows={report.referrers} total={report.summary.views} />
            </AdminPanel>
          </div>
          <div className="analytics-two-columns">
            <AdminPanel title="접속 기기">
              <Breakdown rows={report.devices} total={report.summary.views} />
            </AdminPanel>
            <AdminPanel title="접속 브라우저">
              <Breakdown rows={report.browsers} total={report.summary.views} />
            </AdminPanel>
          </div>
          <AdminPanel
            title="대회 운영 지표"
            description="선택한 기간·대회를 기준으로 기존 제출·인증·운영 로그를 집계합니다. 위의 서비스·이용자 필터는 방문 통계에만 적용됩니다."
          >
            <div className="analytics-operation-grid">
              {[
                ['제출', number(report.operations.submissions) + '건'],
                ['질문', number(report.operations.questions) + '건'],
                [
                  '로그인 성공',
                  number(report.operations.login_successes) + '회',
                ],
                [
                  '로그인 실패',
                  number(report.operations.login_failures) + '회',
                ],
                [
                  '중복 로그인 충돌',
                  number(report.operations.session_conflicts) + '회',
                ],
                [
                  '운영 작업 실패',
                  number(report.operations.operation_failures) + '건',
                ],
                [
                  '평균 채점 결과 대기',
                  duration(report.operations.average_judge_seconds),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className="analytics-caption">
              대회별 인증 지표는 대회가 기록된 인증 요청을 집계합니다. 운영 작업
              실패는 관리자·운영진의 변경 요청 중 실패 응답(4xx·5xx)이며, 채점
              대기는 제출부터 최종 판정까지의 시간입니다.
            </p>
            <div className="analytics-three-columns">
              {[
                ['제출 종류', report.operations.submission_kinds, kindLabels],
                ['채점 결과', report.operations.outcomes, outcomeLabels],
                ['제출 언어', report.operations.languages, null],
              ].map(([label, items, labels]) => (
                <section key={label as string}>
                  <h3 className="analytics-subheading">{label as string}</h3>
                  <Breakdown
                    total={report.operations.submissions}
                    rows={(items as { key: string; count: number }[]).map(
                      (row) => ({
                        key: row.key,
                        label: labels
                          ? ((labels as Record<string, string>)[row.key] ??
                            row.key)
                          : judgeLanguageLabel(row.key),
                        views: row.count,
                        visitors: 0,
                        active_seconds: 0,
                      }),
                    )}
                  />
                </section>
              ))}
            </div>
          </AdminPanel>
          <details className="analytics-definitions">
            <summary>집계 기준 알아보기</summary>
            <ul>
              <li>
                페이지 조회는 화면을 열거나 다른 경로로 이동할 때 집계합니다.
                채점 상태 등 API의 자동 갱신은 조회 수에 포함되지 않습니다.
              </li>
              <li>
                방문자는 브라우저 기준입니다. 다른 기기나 시크릿 모드에서는 새
                방문자로 집계될 수 있습니다. 로그인 계정 수는 같은 계정을 중복
                제거한 값입니다.
              </li>
              <li>
                표의 방문자를 모두 더한 값은 전체 방문자 수와 다를 수 있습니다.
                한 사람이 여러 대회·화면을 이용할 수 있기 때문입니다.
              </li>
              <li>
                이전 방문자는 조회 시작일보다 앞선 보관 기록이 있는
                방문자입니다. 오래된 기록이 삭제되면 첫 방문으로 분류될 수
                있습니다.
              </li>
              <li>
                평균 이용시간은 보이는 화면에서 최대 30초 간격으로 측정한
                근사치입니다. 로그아웃·탭 종료·차단 도구에 따라 일부 누락될 수
                있습니다.
              </li>
              <li>
                알려진 자동 수집 봇과 추적 거부 신호가 있는 브라우저는 수집
                대상에서 제외합니다. 통계는 서비스 마스터만 볼 수 있습니다.
              </li>
            </ul>
          </details>
        </>
      ) : null}
    </AdminLayout>
  );
}
function Empty() {
  return <p className="analytics-empty">선택한 범위에 기록이 없습니다.</p>;
}
function Breakdown({ rows, total }: { rows: UsageBreakdown[]; total: number }) {
  return rows.length ? (
    <ol className="analytics-breakdown">
      {rows.map((row) => (
        <li key={row.key}>
          <div>
            <span>{row.label}</span>
            <strong>
              {number(row.views)}
              <small>
                {total ? Math.round((row.views / total) * 100) : 0}%
              </small>
            </strong>
          </div>
          <span className="analytics-track" aria-hidden="true">
            <span
              style={{ width: `${total ? (row.views / total) * 100 : 0}%` }}
            />
          </span>
        </li>
      ))}
    </ol>
  ) : (
    <Empty />
  );
}
function Timeline({ report }: { report: UsageReport }) {
  const id = useId();
  const rows = report.timeline;
  const max = Math.max(1, ...rows.map((row) => row.views));
  const [focused, setFocused] = useState<number | null>(null);
  const item = focused === null ? null : rows[focused];
  if (!rows.length) return <Empty />;
  const label = (period: string) =>
    report.period.interval === 'hour'
      ? `${period.slice(11, 13)}시`
      : period.slice(5).replace('-', '/');
  const points = (field: 'views' | 'visitors') =>
    rows
      .filter((row) => !row.future)
      .map(
        (row, i) =>
          `${rows.length === 1 ? 500 : (i / (rows.length - 1)) * 1000},${180 - (row[field] / max) * 150}`,
      )
      .join(' ');
  return (
    <div className="analytics-timeline">
      <div className="analytics-chart-legend">
        <span>
          <i />
          페이지 조회
        </span>
        <span>
          <i className="is-green" />
          방문자
        </span>
        <strong id={id} aria-live="polite">
          {item
            ? `${item.period.slice(0, 10)} ${report.period.interval === 'hour' ? label(item.period) : ''} · 조회 ${number(item.views)}회 / 방문자 ${number(item.visitors)}명`
            : `최대 ${number(max === 1 && !report.summary.views ? 0 : max)}회`}
        </strong>
      </div>
      <div className="analytics-timeline-plot">
        <svg
          viewBox="0 0 1000 200"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${report.period.start}부터 ${report.period.end}까지 방문 추이`}
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop stopColor="#6366f1" stopOpacity=".2" />
              <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[30, 80, 130, 180].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="1000"
              y2={y}
              stroke="#e2e8f0"
              strokeDasharray="4 5"
            />
          ))}
          <polygon
            points={`0,180 ${points('views')} ${rows.filter((row) => !row.future).length > 1 ? ((rows.filter((row) => !row.future).length - 1) / (rows.length - 1)) * 1000 : 0},180`}
            fill={`url(#${id}-fill)`}
          />
          <polyline
            points={points('views')}
            fill="none"
            stroke="#6366f1"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={points('visitors')}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
          {rows.length === 1 ? (
            <circle
              cx="500"
              cy={180 - (rows[0].views / max) * 150}
              r="4"
              fill="#6366f1"
            />
          ) : null}
        </svg>
        <div className="analytics-chart-targets">
          {rows.map((row, i) => (
            <button
              key={row.period}
              type="button"
              disabled={row.future}
              onMouseEnter={() => setFocused(i)}
              onMouseLeave={() => setFocused(null)}
              onFocus={() => setFocused(i)}
              onBlur={() => setFocused(null)}
              aria-label={`${row.period}, 조회 ${row.views}회, 방문자 ${row.visitors}명`}
              aria-describedby={id}
              title={`${row.period} · ${number(row.views)}회`}
            />
          ))}
        </div>
      </div>
      <div className="analytics-axis">
        <span>{label(rows[0].period)}</span>
        <span>{label(rows[Math.floor((rows.length - 1) / 2)].period)}</span>
        <span>{label(rows[rows.length - 1].period)}</span>
      </div>
      <details className="analytics-data-details">
        <summary>수치 표로 보기</summary>
        <div className="analytics-table-scroll">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>한국시간</th>
                <th>조회</th>
                <th>방문자</th>
                <th>방문 세션</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((row) => !row.future)
                .map((row) => (
                  <tr key={row.period}>
                    <th>
                      {row.period
                        .replace('T', ' ')
                        .replace(':00:00+09:00', '시')}
                    </th>
                    <td>{number(row.views)}</td>
                    <td>{number(row.visitors)}</td>
                    <td>{number(row.visits)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
function HourChart({ rows }: { rows: UsageReport['hours'] }) {
  if (!rows.length) return <Empty />;
  const max = Math.max(1, ...rows.map((row) => row.views));
  const peak = rows.reduce(
    (top, row) => (row.views > top.views ? row : top),
    rows[0],
  );
  return (
    <>
      <div className="analytics-hours">
        {rows.map((row) => (
          <div key={row.hour}>
            <span
              className="analytics-hour-column"
              style={{
                height: `${Math.max(2, (row.views / max) * 100)}%`,
                opacity: row.views ? 1 : 0.2,
              }}
              title={`${row.hour}시 · ${number(row.views)}회`}
              tabIndex={0}
              role="img"
              aria-label={`${row.hour}시 ${row.views}회`}
            />
            <small>{row.hour % 3 === 0 ? row.hour : ''}</small>
          </div>
        ))}
      </div>
      <p className="analytics-caption">
        {peak.views
          ? `가장 붐빈 시간대는 ${peak.hour}시 · ${number(peak.views)}회 방문했어요.`
          : '아직 시간대별 방문 기록이 없습니다.'}
      </p>
    </>
  );
}
function Heatmap({ rows }: { rows: UsageReport['heatmap'] }) {
  if (!rows.length) return <Empty />;
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  const max = Math.max(1, ...rows.map((row) => row.views));
  return (
    <div className="analytics-heat-scroll">
      <div className="analytics-heatmap">
        <span />
        {Array.from({ length: 24 }, (_, i) => (
          <small key={i}>{i % 3 === 0 ? i : ''}</small>
        ))}
        {days.map((day, d) => (
          <div className="analytics-heat-row" key={day}>
            <span>{day}</span>
            {rows
              .filter((row) => row.weekday === d)
              .map((row) => (
                <span
                  key={row.hour}
                  className="analytics-heat-cell"
                  style={{
                    background: row.views
                      ? `rgba(99,102,241,${0.2 + (row.views / max) * 0.8})`
                      : '#f1f5f9',
                  }}
                  title={`${day}요일 ${row.hour}시 · ${number(row.views)}회`}
                  tabIndex={0}
                  role="img"
                  aria-label={`${day}요일 ${row.hour}시 ${row.views}회`}
                />
              ))}
          </div>
        ))}
      </div>
      <div className="analytics-heat-legend">
        <span>적음</span>
        {[0, 0.2, 0.5, 0.8, 1].map((opacity) => (
          <i
            key={opacity}
            style={{
              background: opacity ? `rgba(99,102,241,${opacity})` : '#f1f5f9',
            }}
          />
        ))}
        <span>많음</span>
      </div>
    </div>
  );
}
