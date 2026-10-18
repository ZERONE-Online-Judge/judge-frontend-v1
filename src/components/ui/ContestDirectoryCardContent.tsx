import InterfaceIcon from '@/components/common/InterfaceIcon';
import { ExperienceArrow } from '@/components/common/PublicExperience';

export type ContestDirectoryMeta = {
  phase: 'running' | 'upcoming' | 'ended';
  startAt: string;
  endAt: string;
  scheduleTbd: boolean;
};

function moment(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date)
    : '일정 확인 중';
}

export default function ContestDirectoryCardContent({
  title,
  organization,
  meta,
  participant,
  operator,
  preview,
  privateContest,
  countdown,
  publicLabels,
}: {
  title: string;
  organization: string;
  meta: ContestDirectoryMeta;
  participant: boolean;
  operator: boolean;
  preview: boolean;
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
      <div className="directory-card-date" aria-hidden="true">
        <span>{hasDate ? `${start.getMonth() + 1}월` : 'COMING'}</span>
        <strong>
          {hasDate ? String(start.getDate()).padStart(2, '0') : '—'}
        </strong>
        <span>{hasDate ? start.getFullYear() : 'SOON'}</span>
      </div>
      <div className="directory-card-info">
        <div className="directory-card-labels">
          <span className={`directory-status is-${meta.phase}`}>
            <i />
            {label}
          </span>
          {participant ? (
            <span className="directory-personal">내 참가</span>
          ) : null}
          {operator ? (
            <span className="directory-personal">
              {preview ? '참가자 미리보기' : '운영'}
            </span>
          ) : null}
          {privateContest ? (
            <span className="directory-private">비공개</span>
          ) : null}
        </div>
        <span className="directory-organization">{organization || 'ZOJ'}</span>
        <h3>{title}</h3>
        {meta.scheduleTbd ? (
          <p className="directory-schedule-tbd">
            대회 일정이 정해지면 안내됩니다.
          </p>
        ) : (
          <dl className="directory-card-schedule">
            <div>
              <dt>시작</dt>
              <dd>
                <time dateTime={meta.startAt}>{moment(meta.startAt)}</time>
              </dd>
            </div>
            <div>
              <dt>종료</dt>
              <dd>
                <time dateTime={meta.endAt}>{moment(meta.endAt)}</time>
              </dd>
            </div>
          </dl>
        )}
        {publicLabels.length ? (
          <div className="directory-resources">
            {publicLabels.map((label) => (
              <span key={label}>
                <InterfaceIcon name="arrowUpRight" />{' '}
                {label
                  .replace('비로그인 공개', '공개')
                  .replace('참가자 공개 유지', '참가자 공개')}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="directory-card-action">
        {countdown && !meta.scheduleTbd ? (
          <span className="directory-countdown">{countdown}</span>
        ) : null}
        <span>
          {preview
            ? '미리보기'
            : operator
              ? '운영 화면'
              : meta.phase === 'ended'
                ? '대회 살펴보기'
                : '대회 확인하기'}
          <ExperienceArrow />
        </span>
      </div>
    </div>
  );
}
