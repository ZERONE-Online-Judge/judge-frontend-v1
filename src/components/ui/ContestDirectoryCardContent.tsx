import { ExperienceArrow } from '@/components/common/PublicExperience';

export type ContestDirectoryMeta = {
  phase: 'running' | 'upcoming' | 'ended';
  startAt: string;
  endAt: string;
  scheduleTbd: boolean;
};

function moment(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    return { date: '일정 확인 중', time: '—', dateTime: undefined };
  return {
    date: new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    }).format(date),
    time: new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date),
    dateTime: value,
  };
}

function resourceGroups(labels: string[]) {
  const groups = new Map<string, string[]>();
  for (const label of labels) {
    const suffix = label.endsWith(' 비로그인 공개')
      ? ' 비로그인 공개'
      : label.endsWith(' 참가자 공개 유지')
        ? ' 참가자 공개 유지'
        : '';
    const access =
      suffix === ' 비로그인 공개' ? '공개' : suffix ? '참가자 공개' : '자료';
    const names = groups.get(access) ?? [];
    names.push(suffix ? label.slice(0, -suffix.length) : label);
    groups.set(access, names);
  }
  return [...groups];
}

export default function ContestDirectoryCardContent({
  title,
  organization,
  meta,
  participant,
  operator,
  privateContest,
  countdown,
  publicLabels,
}: {
  title: string;
  organization: string;
  meta: ContestDirectoryMeta;
  participant: boolean;
  operator: boolean;
  privateContest: boolean;
  countdown?: string;
  publicLabels: string[];
}) {
  const start = new Date(meta.startAt);
  const hasDate = !meta.scheduleTbd && Number.isFinite(start.getTime());
  const label = meta.scheduleTbd
    ? '일정 준비 중'
    : { running: '진행 중', upcoming: '시작 예정', ended: '종료' }[meta.phase];
  return (
    <div className={`directory-card-content is-${meta.phase}`}>
      <div className="directory-card-topline">
        <div className="directory-card-labels">
          <span className={`directory-status is-${meta.phase}`}>
            <i />
            {label}
          </span>
          {participant ? (
            <span className="directory-personal">내 참가</span>
          ) : null}
          {operator ? <span className="directory-personal">운영</span> : null}
          {privateContest ? (
            <span className="directory-private">비공개</span>
          ) : null}
        </div>
        {countdown && !meta.scheduleTbd ? (
          <span className="directory-countdown">{countdown}</span>
        ) : null}
      </div>
      <div className="directory-card-heading">
        <div className="directory-card-date" aria-hidden="true">
          <span>{hasDate ? `${start.getMonth() + 1}월` : '일정'}</span>
          <strong>
            {hasDate ? String(start.getDate()).padStart(2, '0') : '—'}
          </strong>
          <span>{hasDate ? start.getFullYear() : '미정'}</span>
        </div>
        <div className="directory-card-info">
          <h3>{title}</h3>
          <span className="directory-organization">
            {organization || 'ZOJ'}
          </span>
        </div>
      </div>
      {meta.scheduleTbd ? (
        <p className="directory-schedule-tbd">대회 일정 미정</p>
      ) : (
        <ol className="directory-card-schedule" aria-label="대회 일정">
          {[
            { label: '시작', value: meta.startAt },
            { label: '종료', value: meta.endAt },
          ].map(({ label, value }) => {
            const schedule = moment(value);
            return (
              <li key={label}>
                <div className="directory-schedule-detail">
                  <span>{label}</span>
                  <time dateTime={schedule.dateTime}>{schedule.date}</time>
                </div>
                <time
                  className="directory-schedule-time"
                  dateTime={schedule.dateTime}
                >
                  {schedule.time}
                </time>
              </li>
            );
          })}
        </ol>
      )}
      <div className="directory-card-footer">
        {publicLabels.length ? (
          <dl className="directory-resources" aria-label="자료 공개 범위">
            {resourceGroups(publicLabels).map(([access, names]) => (
              <div key={access}>
                <dt>{access}</dt>
                <dd>{names.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <span className="directory-card-action">
          {operator ? '운영 화면' : '대회 보기'}
          <ExperienceArrow />
        </span>
      </div>
    </div>
  );
}
