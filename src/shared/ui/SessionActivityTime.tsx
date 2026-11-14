import useSessionActivityClock from '@/shared/hooks/useSessionActivityClock';
import { formatRelativeTime } from '@/shared/lib/dateTime';

function ActivityTime({ date, compact }: { date: Date; compact: boolean }) {
  const now = useSessionActivityClock();
  const calendar = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const full = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
  const clock = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  const day =
    calendar.format(date) === calendar.format(new Date(now))
      ? '오늘'
      : calendar.format(date);
  const relative =
    now - date.getTime() < 60_000
      ? '방금 전'
      : formatRelativeTime(date.toISOString(), now);

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <time dateTime={date.toISOString()} title={`${full} (KST)`}>
        {compact ? `${day} ${clock}` : full}
      </time>
      <span className="whitespace-nowrap text-slate-500">({relative})</span>
    </span>
  );
}

export default function SessionActivityTime({
  value,
  compact = false,
  emptyText = '시각 정보 없음',
}: {
  value?: string | number | null;
  compact?: boolean;
  emptyText?: string;
}) {
  const date = value == null || value === '' ? null : new Date(value);
  return date && Number.isFinite(date.getTime()) ? (
    <ActivityTime date={date} compact={compact} />
  ) : (
    <span>{emptyText}</span>
  );
}
