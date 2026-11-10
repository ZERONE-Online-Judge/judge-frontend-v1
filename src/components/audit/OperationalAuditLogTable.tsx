import { useState } from 'react';
import type { OperationalAuditLog } from '@/domains/auditMonitoring/types';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/dateTime';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import SessionEnvironment from '@/shared/ui/SessionEnvironment';
import {
  actionLabel,
  asRecord,
  auditChanges,
  fieldLabel,
  groupAuditLogs,
  isVerificationAction,
  operationSummary,
  targetLabel,
  valueLabel,
} from '@/components/audit/auditPresentation';

function actorLabel(log: OperationalAuditLog) {
  return log.actor_name || log.actor_email || '확인 불가';
}
function roleLabel(role?: string | null) {
  return role === 'service_master'
    ? '서비스 마스터'
    : role === 'operator'
      ? '운영자'
      : '권한 확인 전';
}
function contestLabel(log: OperationalAuditLog) {
  return String(
    log.details?.contest_title ||
      (log.contest_id ? log.contest_id.slice(0, 8) : '전체 서비스'),
  );
}
function ResultBadge({ logs }: { logs: OperationalAuditLog[] }) {
  const failed = logs.filter((log) => log.status_code >= 400).length;
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${failed ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
    >
      {logs.length > 1
        ? failed
          ? `실패 ${failed} / ${logs.length}건`
          : `${logs.length}건 성공`
        : failed
          ? `${logs[0].status_code} ${logs[0].status_code < 500 ? '거부' : '실패'}`
          : isVerificationAction(logs[0])
            ? '요청 접수'
            : '성공'}
    </span>
  );
}
function ChangeSummary({ log }: { log: OperationalAuditLog }) {
  const changes = auditChanges(log);
  if (log.status_code >= 400)
    return (
      <p className="text-xs text-rose-700">
        요청 실패 · 적용된 변경으로 표시하지 않습니다.
      </p>
    );
  if (changes.length)
    return (
      <p className="line-clamp-2 text-xs leading-5 [overflow-wrap:anywhere] text-slate-600">
        {changes
          .slice(0, 2)
          .map(
            (change) =>
              `${fieldLabel(change.field)}: ${valueLabel(change.old, change.field).slice(0, 45)} → ${valueLabel(change.new, change.field).slice(0, 45)}`,
          )
          .join(' · ')}
        {changes.length > 2 ? ` · 외 ${changes.length - 2}개 변경` : ''}
      </p>
    );
  if (log.details?.change_kind === 'updated')
    return <p className="text-xs text-slate-600">실제 변경된 값 없음</p>;
  const summary = operationSummary(log);
  if (!summary && targetLabel(log)) return null;
  return (
    <p className="line-clamp-2 text-xs leading-5 [overflow-wrap:anywhere] text-slate-600">
      {summary || '저장된 대상 정보가 없습니다. 상세 기록을 확인하세요.'}
    </p>
  );
}

function Operation({
  items,
  onSelect,
}: {
  items: OperationalAuditLog[];
  onSelect: (log: OperationalAuditLog) => void;
}) {
  const first = items[0];
  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="font-semibold [overflow-wrap:anywhere] text-slate-900">
        {actionLabel(first)}
        {items.length > 1 ? ` · ${items.length}건` : ''}
      </p>
      {items.length > 1 ? (
        <>
          <p className="text-xs text-slate-600">
            {formatDateTime(items[items.length - 1].created_at)} ~{' '}
            {formatDateTime(first.created_at)}
          </p>
          <details className="rounded-lg border border-slate-200">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-indigo-700">
              개별 기록 {items.length}건 펼치기
            </summary>
            <div className="max-h-72 overflow-y-auto border-t border-slate-200">
              {items.map((item) => (
                <button
                  key={item.operational_audit_log_id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-indigo-50"
                >
                  <span className="min-w-0 text-xs text-slate-700">
                    <span className="block truncate">
                      {targetLabel(item) || actionLabel(item)}
                    </span>
                    <time className="text-slate-600">
                      {formatDateTime(item.created_at)}
                    </time>
                    <SessionEnvironment
                      environment={item.environment}
                      className="mt-1 block text-slate-500"
                    />
                  </span>
                  <ResultBadge logs={[item]} />
                </button>
              ))}
            </div>
          </details>
        </>
      ) : (
        <>
          {targetLabel(first) ? (
            <p className="line-clamp-2 text-xs leading-5 font-medium [overflow-wrap:anywhere] text-slate-700">
              {targetLabel(first)}
            </p>
          ) : null}
          <ChangeSummary log={first} />
          <button
            type="button"
            className="w-fit py-1 text-xs font-semibold text-indigo-700 hover:underline"
            onClick={() => onSelect(first)}
          >
            상세 기록 보기
          </button>
        </>
      )}
    </div>
  );
}

export default function OperationalAuditLogTable({
  logs,
  loading = false,
}: {
  logs: OperationalAuditLog[];
  loading?: boolean;
}) {
  const [grouped, setGrouped] = useState(true);
  const [selected, setSelected] = useState<OperationalAuditLog | null>(null);
  if (!logs.length)
    return (
      <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
        {loading
          ? '운영 로그를 불러오는 중입니다.'
          : '아직 기록된 운영 로그가 없습니다.'}
      </div>
    );
  const groups = grouped
    ? groupAuditLogs(logs)
    : logs.map((log) => ({ id: log.operational_audit_log_id, logs: [log] }));
  return (
    <div className="grid w-full min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          {logs.length}개 기록 · {groups.length}개 행
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(event) => setGrouped(event.target.checked)}
          />
          반복 파일·테스트케이스 작업 묶기
        </label>
      </div>
      {grouped ? (
        <p className="text-xs text-slate-600">
          현재 목록에서 같은 운영자가 같은 대상에 2분 이내 실행한 반복 작업을
          묶습니다. 개별 기록은 모두 유지됩니다.
        </p>
      ) : null}
      <div className="hidden w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200 md:block">
        <table className="w-full min-w-[850px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[15%]" />
            <col className="w-[19%]" />
            <col className="w-[15%]" />
            <col />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              {['시간', '작업자', '대회', '작업 내용', '결과'].map((label) => (
                <th key={label} scope="col" className="px-4 py-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {groups.map((group) => {
              const log = group.logs[0];
              return (
                <tr key={group.id} className="align-top hover:bg-slate-50/50">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-slate-800">
                      {formatRelativeTime(log.created_at)}
                    </p>
                    <time className="mt-1 block text-xs leading-5 text-slate-600">
                      {formatDateTime(log.created_at)}
                    </time>
                  </td>
                  <td className="px-4 py-3.5 [overflow-wrap:anywhere]">
                    <p className="font-medium text-slate-900">
                      {actorLabel(log)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {log.actor_email}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {roleLabel(log.actor_role)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      <SessionEnvironment environment={log.environment} />
                      {group.logs.length > 1 ? ' · 최근 기록' : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 [overflow-wrap:anywhere] text-slate-600">
                    {contestLabel(log)}
                  </td>
                  <td className="px-4 py-3.5">
                    <Operation items={group.logs} onSelect={setSelected} />
                  </td>
                  <td className="px-3 py-3.5">
                    <ResultBadge logs={group.logs} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid w-full min-w-0 gap-3 md:hidden">
        {groups.map((group) => (
          <article
            className="grid w-full min-w-0 gap-3 rounded-xl border border-slate-200 p-4"
            key={group.id}
          >
            <div className="flex items-center justify-between gap-2">
              <time className="text-xs text-slate-600">
                {formatDateTime(group.logs[0].created_at)}
              </time>
              <ResultBadge logs={group.logs} />
            </div>
            <p className="text-xs [overflow-wrap:anywhere] text-slate-600">
              {actorLabel(group.logs[0])} · {contestLabel(group.logs[0])}
            </p>
            <p className="text-xs text-slate-600">
              <SessionEnvironment environment={group.logs[0].environment} />
              {group.logs.length > 1 ? ' · 최근 기록' : ''}
            </p>
            <Operation items={group.logs} onSelect={setSelected} />
          </article>
        ))}
      </div>
      {selected ? (
        <AuditDetails log={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function AuditDetails({
  log,
  onClose,
}: {
  log: OperationalAuditLog;
  onClose: () => void;
}) {
  const changes = auditChanges(log),
    body = asRecord(log.details?.body);
  return (
    <ModalDialog
      title={actionLabel(log)}
      description={`${formatDateTime(log.created_at)} · ${actorLabel(log)}`}
      onClose={onClose}
      size="lg"
      footer={<ModalButton onClick={onClose}>닫기</ModalButton>}
    >
      <div className="grid min-w-0 gap-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <ResultBadge logs={[log]} />
          <span className="text-slate-600">{contestLabel(log)}</span>
        </div>
        {targetLabel(log) ? (
          <p className="font-semibold [overflow-wrap:anywhere]">
            {targetLabel(log)}
          </p>
        ) : null}
        {changes.length ? (
          <section>
            <h3 className="mb-3 font-semibold">
              실제 변경된 항목 · {changes.length}개
            </h3>
            <dl className="grid gap-3">
              {changes.map((change) => (
                <div
                  key={change.field}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <dt className="mb-2 font-semibold text-slate-800">
                    {fieldLabel(change.field)}
                    {change.truncated ? (
                      <span className="ml-2 text-xs font-normal text-slate-600">
                        긴 내용은 앞부분만 표시 · 전체 값은 변경됨
                      </span>
                    ) : null}
                  </dt>
                  <dd className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <div className="min-w-0 rounded bg-slate-50 p-2">
                      <span className="text-xs text-slate-600">변경 전</span>
                      <p className="mt-1 max-h-48 overflow-auto text-xs leading-6 [overflow-wrap:anywhere] whitespace-pre-wrap">
                        {valueLabel(change.old, change.field)}
                      </p>
                    </div>
                    <div className="min-w-0 rounded bg-indigo-50 p-2">
                      <span className="text-xs text-indigo-700">변경 후</span>
                      <p className="mt-1 max-h-48 overflow-auto text-xs leading-6 [overflow-wrap:anywhere] whitespace-pre-wrap">
                        {valueLabel(change.new, change.field)}
                      </p>
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          <ChangeSummary log={log} />
        )}
        {Object.keys(body).length ? (
          <details className="rounded-lg border border-slate-200">
            <summary className="cursor-pointer px-3 py-2 font-medium">
              요청에 포함된 값 · 실제 변경과 다를 수 있습니다
            </summary>
            <dl className="grid max-h-80 gap-3 overflow-auto border-t border-slate-200 p-3">
              {Object.entries(body).map(([field, value]) => (
                <div className="min-w-0" key={field}>
                  <dt className="text-xs font-semibold text-slate-600">
                    {fieldLabel(field)}
                  </dt>
                  <dd className="mt-1 text-xs leading-5 [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {valueLabel(value, field)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
        <details className="rounded-lg border border-slate-200">
          <summary className="cursor-pointer px-3 py-2 font-medium">
            접속 정보와 원본 기록
          </summary>
          <div className="grid min-w-0 gap-2 border-t border-slate-200 p-3 text-xs [overflow-wrap:anywhere] text-slate-600">
            <p>
              {log.actor_email} · {roleLabel(log.actor_role)}
            </p>
            <p>IP: {log.client_ip || '없음'}</p>
            <p>
              접속 환경: <SessionEnvironment environment={log.environment} />
            </p>
            <p>원본 User-Agent: {log.user_agent || '없음'}</p>
            <code>
              {log.method} {log.path}
            </code>
            <code>요청 ID: {log.request_id || '없음'}</code>
            <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-3 whitespace-pre-wrap">
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </div>
        </details>
      </div>
    </ModalDialog>
  );
}
