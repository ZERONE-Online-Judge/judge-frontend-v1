import { operatingHistory } from '@/data/operatingHistory';
import './OperatingHistoryTimeline.css';

const events = [...operatingHistory].sort((a, b) =>
  b.date.localeCompare(a.date),
);

export default function OperatingHistoryTimeline() {
  return (
    <ol className="about-history-timeline" aria-label="대회 운영 이력, 최신순">
      {events.map((event, index) => {
        const badge =
          index === 0
            ? '최근 실운영'
            : index === events.length - 1
              ? '첫 실운영'
              : '실운영 사례';
        const metrics = [
          {
            label: '참가팀',
            value: event.teams,
            unit: '팀',
            note: `참가자 ${event.participants.toLocaleString('ko-KR')}명`,
          },
          {
            label: '코드 제출',
            value: event.submissions,
            unit: '건',
            scope: event.submissionScope,
          },
          { label: '문제', value: event.problems, unit: '개' },
          { label: '테스트케이스', value: event.testCases, unit: '개' },
        ];

        return (
          <li className="about-history-item" key={event.id}>
            <div className="about-history-date">
              <time
                dateTime={event.date}
                aria-label={event.date.replaceAll('-', '. ')}
              >
                <span>{event.date.slice(0, 4)}</span>
                <strong>{event.date.slice(5).replace('-', '.')}</strong>
              </time>
              <span>{event.hours}시간</span>
            </div>
            <article
              className="about-event-history"
              aria-label={event.title}
              data-reveal
            >
              <header className="about-history-heading">
                <div className="about-history-identity">
                  <h3>{event.title}</h3>
                  <p className="about-history-name" lang="en">
                    {event.name}
                  </p>
                  <p className="about-history-organization">
                    {event.organization}
                  </p>
                </div>
                <span className="about-history-badge">{badge}</span>
              </header>
              <dl className="about-history-stats">
                {metrics.map((metric) => (
                  <div key={metric.label}>
                    <dt
                      title={metric.scope}
                      aria-label={
                        metric.scope
                          ? `${metric.label}: ${metric.scope}`
                          : undefined
                      }
                    >
                      {metric.label}
                    </dt>
                    <dd>
                      {metric.value.toLocaleString('ko-KR')}
                      <span>{metric.unit}</span>
                    </dd>
                    {metric.note && <p>{metric.note}</p>}
                  </div>
                ))}
              </dl>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
