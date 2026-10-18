import InterfaceIcon from '@/components/common/InterfaceIcon';
import PublicHero from '@/components/common/PublicHero';
import { type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ExperienceArrow,
  ExperienceReveal,
} from '@/components/common/PublicExperience';
import { getPublicJudgeStatus } from '@/domains/auditMonitoring/api';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import JudgeParticipantExperience from '@/components/public/JudgeParticipantExperience';
import './PublicExperience.css';

export default function JudgeStatusPage() {
  const isDocumentVisible = useDocumentVisibility();
  const query = useQuery({
    queryKey: ['public-judge-status'],
    queryFn: getPublicJudgeStatus,
    refetchInterval: isDocumentVisible ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const status = query.data;
  const unavailable = query.isError;
  const connected = !!status && status.active_node_count > 0 && !unavailable;
  const tone = unavailable
    ? 'unknown'
    : !status
      ? 'loading'
      : connected
        ? 'online'
        : 'offline';
  const title = unavailable
    ? '잠시 연결을 확인하고 있어요.'
    : !status
      ? '채점 서버를 만나고 있어요.'
      : !connected
        ? '채점 서버를 기다리고 있어요.'
        : '채점 서버가 연결되어 있어요.';
  const description = unavailable
    ? '최신 상태를 가져오지 못했습니다. 잠시 후 자동으로 다시 확인할게요.'
    : !status
      ? '채점 서버의 연결 상태를 확인하고 있습니다.'
      : !connected
        ? '현재 연결된 채점 서버가 없습니다. 제출한 코드의 상태는 대회 채점현황에서 확인해 주세요.'
        : '서버 연결을 확인했습니다. 내 코드의 진행 상황과 결과는 대회 채점현황에서 확인해 주세요.';
  const metrics = [
    {
      label: '연결된 채점 서버',
      value: status?.active_node_count,
      unit: '대',
      description: '현재 연결을 확인한 서버예요.',
      icon: '▤',
    },
  ];

  return (
    <div className={`public-experience judge-experience is-${tone}`}>
      <PublicHero className="judge-hero">
        <div className="experience-hero-grid">
          <div className="experience-hero-copy">
            <p className="experience-eyebrow">BEHIND EVERY ANSWER</p>
            <h1>
              당신의 코드가
              <br />
              답을 만나는 곳<span className="experience-lime">.</span>
            </h1>
            <p className="experience-lead">
              제출부터 결과까지, 코드를 살펴보는 채점 서버.
              <br />
              지금의 연결 상태부터 판정과 점수까지, 함께 알아봐요.
            </p>
            <a className="experience-button is-lime" href="#judge-now">
              지금 상태 살펴보기 <ExperienceArrow />
            </a>
          </div>
          <div className="judge-room" aria-hidden="true">
            <div className="judge-room-orbit" />
            <div className="judge-room-label">
              <span className="experience-live">
                <i /> JUDGE ROOM
              </span>
              <span>ZOJ</span>
            </div>
            <div className="judge-racks">
              {[0, 1, 2].map((rack) => (
                <div
                  className="judge-rack"
                  key={rack}
                  style={{ '--rack': rack } as CSSProperties}
                >
                  <div className="judge-rack-cap">
                    <span /> <span />
                  </div>
                  {[0, 1, 2, 3].map((slot) => (
                    <div
                      className="judge-server"
                      key={slot}
                      style={
                        {
                          '--delay': `${(rack * 4 + slot) * 0.19}s`,
                        } as CSSProperties
                      }
                    >
                      <span className="judge-vents">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <i key={i} />
                        ))}
                      </span>
                      <span className="judge-lights">
                        <i />
                        <i />
                      </span>
                    </div>
                  ))}
                  <div className="judge-rack-foot" />
                </div>
              ))}
            </div>
            <div className="judge-room-floor" />
            <div className="judge-room-caption">
              <span>
                {connected ? '채점 서버 연결됨' : '서버 연결을 확인하는 중'}
              </span>
              <span className="judge-signal">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <i
                    key={i}
                    style={{ '--delay': `${i * 0.12}s` } as CSSProperties}
                  />
                ))}
              </span>
            </div>
          </div>
        </div>
      </PublicHero>

      <section
        className="experience-section experience-container"
        id="judge-now"
      >
        <ExperienceReveal>
          <div className="experience-section-heading">
            <div>
              <p className="experience-eyebrow">RIGHT NOW</p>
              <h2>채점 서버 연결 상태</h2>
            </div>
            <p>상태는 5초마다 자동으로 확인합니다.</p>
          </div>
          <div className={`judge-status-note is-${tone}`} role="status">
            <span className="judge-status-symbol">
              <InterfaceIcon
                name={connected ? 'check' : unavailable ? 'alert' : 'circle'}
              />
            </span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </div>
          {unavailable && status ? (
            <p className="experience-stale">
              아래 수치는 마지막으로 확인한 상태입니다. 연결이 복구되면
              갱신됩니다.
            </p>
          ) : null}
          <div className="judge-metrics">
            {metrics.map((metric) => (
              <article className="judge-metric" key={metric.label}>
                <div>
                  <h3>{metric.label}</h3>
                  <span aria-hidden="true">{metric.icon}</span>
                </div>
                <p>
                  <strong key={metric.value ?? 'loading'}>
                    {metric.value === undefined
                      ? '—'
                      : metric.value.toLocaleString('ko-KR')}
                  </strong>
                  <span>{metric.unit}</span>
                </p>
                <p>{metric.description}</p>
              </article>
            ))}
          </div>
          <div className="judge-refresh">
            <span>
              <i
                className={query.isFetching ? 'is-refreshing' : ''}
                aria-hidden="true"
              />
              {query.isFetching
                ? '새로운 상태를 확인하고 있어요'
                : '이 화면이 열려 있는 동안 자동으로 갱신해요'}
            </span>
            <span>
              마지막 확인{' '}
              <time
                dateTime={
                  query.dataUpdatedAt
                    ? new Date(query.dataUpdatedAt).toISOString()
                    : undefined
                }
              >
                {query.dataUpdatedAt
                  ? new Date(query.dataUpdatedAt).toLocaleTimeString('ko-KR', {
                      hour12: false,
                    })
                  : '아직 확인 전'}
              </time>
            </span>
            {unavailable ? (
              <button
                className="experience-text-link"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
                type="button"
              >
                다시 확인하기 <InterfaceIcon name="refresh" />
              </button>
            ) : null}
          </div>
        </ExperienceReveal>
      </section>

      <JudgeParticipantExperience />
      <section className="experience-container experience-section">
        <ExperienceReveal className="experience-callout">
          <div>
            <p className="experience-eyebrow">NEED A HAND?</p>
            <h2>
              결과가 궁금하거나,
              <br />
              도움이 필요하다면.
            </h2>
            <p>
              개별 제출은 대회 채점현황에서, 이용 중 궁금한 점은 도움말에서
              확인하세요.
            </p>
          </div>
          <div className="experience-actions">
            <Link className="experience-button is-dark" to="/contests">
              대회 목록 <ExperienceArrow />
            </Link>
            <Link className="experience-text-link" to="/support/help">
              채점 도움말 <ExperienceArrow />
            </Link>
          </div>
        </ExperienceReveal>
      </section>
    </div>
  );
}
