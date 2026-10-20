import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import HomeHero from './HomeHero';
import {
  ExperienceArrow,
  ExperienceReveal,
} from '@/components/common/PublicExperience';
import ContestListItem from '@/components/ui/ContestListItem';
import { getPublicContests } from '@/domains/contestAdministration/api';
import { contestAccessPhase } from '@/domains/contestAdministration/logic';
import { toContestCardData } from '@/domains/contestAdministration/presentation';
import { getPublicServiceNotices } from '@/domains/serviceCommunication/api';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import '@/pages/public/ContestsPage.css';
import './MainPage.css';

const shortcuts = [
  {
    number: '01',
    title: '서비스 소개',
    description: 'ZOJ의 기능과 운영 이력입니다.',
    to: '/about',
    label: 'ZOJ 소개',
    symbol: 'asterisk',
  },
  {
    number: '02',
    title: '참가 안내',
    description: '로그인, 문제 제출, 결과 확인 방법입니다.',
    to: '/support',
    label: '참가 방법',
    symbol: 'arrowUpRight',
  },
  {
    number: '03',
    title: '채점 안내',
    description: '채점 서버 상태와 판정 기준을 확인합니다.',
    to: '/judge-status',
    label: '채점 안내',
    symbol: 'code',
  },
] as const;

export default function MainPage() {
  const visible = useDocumentVisibility();
  const directoryToken = useSessionStore(
    (state) =>
      state.generalSession?.accessToken ??
      state.participantSession?.accessToken,
  );
  const noticesQuery = useQuery({
    queryKey: ['public-service-notices'],
    queryFn: getPublicServiceNotices,
    refetchInterval: visible ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const contestsQuery = useQuery({
    queryKey: ['public-contests', tokenQueryIdentity(directoryToken)],
    queryFn: () => getPublicContests(directoryToken),
    refetchInterval: visible ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const notices = [...(noticesQuery.data ?? [])]
    .sort(
      (a, b) =>
        Number(b.emergency) - Number(a.emergency) ||
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
    )
    .slice(0, 5);
  const phaseOrder = { running: 0, before: 1, schedule_tbd: 2, ended: 3 };
  const contests = [...(contestsQuery.data ?? [])]
    .sort((a, b) => {
      const aPhase = contestAccessPhase(a),
        bPhase = contestAccessPhase(b);
      return (
        phaseOrder[aPhase] - phaseOrder[bPhase] ||
        (aPhase === 'before'
          ? new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
          : new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
      );
    })
    .slice(0, 4);
  return (
    <div className="public-experience contest-directory home-experience">
      <HomeHero />
      <section
        className="experience-container home-explore"
        id="home-explore"
        aria-label="ZOJ 둘러보기"
      >
        <ExperienceReveal className="home-shortcuts">
          {shortcuts.map((item) => (
            <Link key={item.to} to={item.to}>
              <div>
                <span>
                  {item.number} / {item.label}
                </span>
                <i aria-hidden="true">
                  <InterfaceIcon name={item.symbol} />
                </i>
              </div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <span className="home-shortcut-arrow">
                <ExperienceArrow />
              </span>
            </Link>
          ))}
        </ExperienceReveal>
      </section>
      <section className="experience-container experience-section home-contests">
        <div className="experience-section-heading">
          <div>
            <p className="experience-eyebrow">CONTESTS</p>
            <h2>대회 목록</h2>
          </div>
          <Link className="experience-text-link" to="/contests">
            전체 대회 보기 <ExperienceArrow />
          </Link>
        </div>
        {contestsQuery.isPending ? (
          <p className="home-feed-message" role="status">
            대회 일정을 불러오는 중입니다.
          </p>
        ) : null}
        {contestsQuery.isError ? (
          <div className="home-feed-message is-error" role="alert">
            <p>대회 정보를 불러오지 못했습니다.</p>
            <button
              type="button"
              disabled={contestsQuery.isFetching}
              onClick={() => void contestsQuery.refetch()}
            >
              다시 확인하기 <InterfaceIcon name="refresh" />
            </button>
          </div>
        ) : null}
        {contests.length ? (
          <ul className="home-contest-list">
            {contests.map((contest) => {
              const phase = contestAccessPhase(contest);
              return (
                <ContestListItem
                  key={contest.contest_id}
                  {...toContestCardData(contest)}
                  directoryMeta={{
                    phase:
                      phase === 'running'
                        ? 'running'
                        : phase === 'ended'
                          ? 'ended'
                          : 'upcoming',
                    startAt: contest.start_at,
                    endAt: contest.end_at,
                    scheduleTbd: phase === 'schedule_tbd',
                  }}
                />
              );
            })}
          </ul>
        ) : !contestsQuery.isPending && !contestsQuery.isError ? (
          <div className="home-feed-message">
            <span aria-hidden="true">
              <InterfaceIcon name="asterisk" />
            </span>
            <h3>공개된 대회가 없습니다.</h3>
            <p>공개된 대회는 이 목록에 표시됩니다.</p>
          </div>
        ) : null}
      </section>
      <section
        className="experience-soft-section"
        aria-labelledby="home-notice-heading"
      >
        <div className="experience-container experience-section home-news">
          <div className="home-news-heading">
            <div>
              <h2 id="home-notice-heading">공지사항</h2>
              <p>서비스 업데이트와 점검 안내</p>
            </div>
            <Link to="/notices" className="experience-text-link">
              전체 보기 <ExperienceArrow />
            </Link>
          </div>
          <div>
            {noticesQuery.isPending ? (
              <p className="home-feed-message" role="status">
                공지사항을 불러오는 중입니다.
              </p>
            ) : null}
            {noticesQuery.isError ? (
              <div className="home-feed-message is-error" role="alert">
                <p>공지사항을 불러오지 못했습니다.</p>
                <button
                  type="button"
                  disabled={noticesQuery.isFetching}
                  onClick={() => void noticesQuery.refetch()}
                >
                  다시 확인하기 <InterfaceIcon name="refresh" />
                </button>
              </div>
            ) : null}
            {notices.length ? (
              <ul className="home-notice-list">
                {notices.map((notice) => (
                  <li key={notice.service_notice_id}>
                    <Link
                      to={`/notices/${encodeURIComponent(notice.service_notice_id)}`}
                    >
                      <span
                        className={`home-notice-badge ${notice.emergency ? 'is-emergency' : ''}`}
                      >
                        {notice.emergency ? '긴급' : '공지'}
                      </span>
                      <h3>{notice.title}</h3>
                      <time dateTime={notice.published_at}>
                        {new Intl.DateTimeFormat('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        }).format(new Date(notice.published_at))}
                      </time>
                      <ExperienceArrow />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : !noticesQuery.isPending && !noticesQuery.isError ? (
              <div className="home-feed-message">
                <h3>등록된 공지사항이 없습니다.</h3>
                <p>이용 방법은 지원 안내에서 확인할 수 있습니다.</p>
                <Link to="/support" className="experience-text-link">
                  지원 안내 <ExperienceArrow />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
