import InterfaceIcon from '@/components/common/InterfaceIcon';
import { Link } from 'react-router-dom';
import ContestPageFrame from '@/components/contest/ContestPageFrame';
import ContestPageNavigation from '@/components/contest/ContestPageNavigation';
import {
  contestAccessPhase,
  contestResourceAccess,
} from '@/domains/contestAdministration/logic';
import type { PublicContestDetail } from '@/domains/contestAdministration/types';
import { contestLoginPath } from '@/shared/lib/loginRedirect';
import MarkdownPreview from '@/shared/ui/MarkdownPreview';
import './ContestPublicOverview.css';

type PublicOverviewDetail = PublicContestDetail & {
  participant_count?: number;
  team_count?: number;
};

type OverviewIconName =
  | 'arrow'
  | 'book'
  | 'chart'
  | 'code'
  | 'message'
  | 'clock'
  | 'people';

function OverviewIcon({ name }: { name: OverviewIconName }) {
  const paths: Record<OverviewIconName, string> = {
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    book: 'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4V4Zm9 3a3 3 0 0 1 3-3h4v15h-3a4 4 0 0 0-4 2',
    chart: 'M4 20h16M6 16v-5m6 5V4m6 12V8',
    code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16',
    message:
      'M20 14a4 4 0 0 1-4 4H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8ZM8 8h8m-8 5h5',
    clock: 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    people:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4-3.87a4 4 0 0 1 0 7.75',
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function scheduleLabel(value: string, scheduleTbd: boolean) {
  const date = new Date(value);
  if (scheduleTbd || !value || Number.isNaN(date.getTime())) return '일정 미정';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(date);
}

function durationLabel(start: string, end: string, scheduleTbd: boolean) {
  const duration = new Date(end).getTime() - new Date(start).getTime();
  if (scheduleTbd || !Number.isFinite(duration) || duration <= 0) return '미정';
  const minutes = Math.floor(duration / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const restMinutes = minutes % 60;
  return (
    [
      days && `${days}일`,
      hours && `${hours}시간`,
      restMinutes && `${restMinutes}분`,
    ]
      .filter(Boolean)
      .join(' ') || '1분 미만'
  );
}

function isKnownCount(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export default function ContestPublicOverview({
  detail,
}: {
  detail: PublicOverviewDetail;
}) {
  const {
    contest,
    divisions,
    participant_count: participantCount,
    team_count: teamCount,
  } = detail;
  const phase = contestAccessPhase(contest);
  const ended = phase === 'ended';
  const scheduleTbd = phase === 'schedule_tbd';
  const contestPath = `/contests/${encodeURIComponent(contest.contest_id)}`;
  const publicNotices =
    ended && contestResourceAccess(contest, 'notice') === 'public';
  const publicBoard =
    ended && contestResourceAccess(contest, 'board') === 'public';
  const resourceCards: {
    path: string;
    title: string;
    description: string;
    icon: OverviewIconName;
  }[] = [];

  if (ended && contestResourceAccess(contest, 'problem') === 'public') {
    resourceCards.push({
      path: 'problems',
      title: '문제집',
      description: '대회에서 출제된 문제를 만나보세요.',
      icon: 'book',
    });
  }
  if (ended && contestResourceAccess(contest, 'scoreboard') === 'public') {
    resourceCards.push({
      path: 'scoreboard',
      title: '스코어보드',
      description: '참가자들의 대회 기록을 확인하세요.',
      icon: 'chart',
    });
  }
  if (ended && contestResourceAccess(contest, 'submission') === 'public') {
    resourceCards.push({
      path: 'submissions',
      title: '채점현황',
      description: '제출 기록과 채점 결과를 살펴보세요.',
      icon: 'code',
    });
  }
  if (publicNotices || publicBoard) {
    resourceCards.push({
      path: 'board',
      title:
        publicNotices && publicBoard
          ? '공지사항 · 게시판'
          : publicNotices
            ? '공지사항'
            : '게시판',
      description:
        publicNotices && publicBoard
          ? '대회 소식과 질문·답변을 확인하세요.'
          : publicNotices
            ? '운영진이 전한 대회 소식을 확인하세요.'
            : '대회에 남겨진 질문과 답변을 확인하세요.',
      icon: 'message',
    });
  }

  const statusLabel = {
    schedule_tbd: '일정 미정',
    before: '진행 예정',
    running: '진행 중',
    ended: '종료된 대회',
  }[phase];

  return (
    <ContestPageFrame>
      <div className="contest-public-overview">
        <Link className="contest-public-back" to="/contests">
          <span aria-hidden="true">
            <InterfaceIcon name="arrowLeft" />
          </span>{' '}
          대회 목록
        </Link>

        <section
          className="contest-public-hero"
          aria-labelledby="contest-public-title"
        >
          <div className="contest-public-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="contest-public-hero-top">
            <span className="contest-public-eyebrow">ZOJ / CONTEST</span>
            <span className="contest-public-status" data-phase={phase}>
              <i aria-hidden="true" />
              {statusLabel}
            </span>
          </div>
          <div className="contest-public-hero-copy">
            <p className="contest-public-organization">
              {contest.organization_name || '주최 정보 준비 중'}
            </p>
            <h1 id="contest-public-title">{contest.title}</h1>
            <p className="contest-public-intro">
              {ended
                ? '함께 도전했던 시간, 대회의 이야기를 만나보세요.'
                : phase === 'running'
                  ? '지금, 각자의 생각이 정답을 향하고 있습니다.'
                  : '새로운 도전을 준비하는 당신을 기다립니다.'}
            </p>
          </div>
          <div className="contest-public-hero-bottom">
            <span>{ended ? 'CONTEST ARCHIVE' : 'YOUR NEXT CHALLENGE'}</span>
            <span className="contest-public-host-label">
              주최 · {contest.organization_name || '미정'}
            </span>
          </div>
        </section>

        <ContestPageNavigation
          contest={contest}
          contestId={contest.contest_id}
        />

        <section
          className="contest-public-facts"
          aria-label="대회 일정과 참가 규모"
        >
          <div className="contest-public-schedule">
            <span className="contest-public-fact-icon">
              <OverviewIcon name="clock" />
            </span>
            <div>
              <h2>
                대회 일정 <span>한국 시간 (KST)</span>
              </h2>
              <dl>
                <div>
                  <dt>시작</dt>
                  <dd>{scheduleLabel(contest.start_at, scheduleTbd)}</dd>
                </div>
                <div>
                  <dt>종료</dt>
                  <dd>{scheduleLabel(contest.end_at, scheduleTbd)}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="contest-public-stat">
            <span className="contest-public-fact-label">진행 시간</span>
            <strong>
              {durationLabel(contest.start_at, contest.end_at, scheduleTbd)}
            </strong>
            <span className="contest-public-stat-caption">
              대회 시작부터 종료까지
            </span>
          </div>
          <div className="contest-public-stat">
            <span className="contest-public-fact-label">
              <OverviewIcon name="people" />
              {ended ? '함께한 참가자' : '등록된 참가자'}
            </span>
            <strong>
              {isKnownCount(participantCount) ? (
                <>
                  {participantCount.toLocaleString('ko-KR')}
                  <small>명</small>
                </>
              ) : (
                '집계 정보 없음'
              )}
            </strong>
            <span className="contest-public-stat-caption">
              {isKnownCount(teamCount)
                ? `${teamCount.toLocaleString('ko-KR')}개 참가팀`
                : '참가자 등록 기준'}
            </span>
          </div>
        </section>

        <div className="contest-public-details">
          <section
            className="contest-public-description"
            aria-labelledby="contest-public-about"
          >
            <p className="contest-public-section-label">ABOUT THE CONTEST</p>
            <h2 id="contest-public-about">
              대회를 소개합니다<span aria-hidden="true">.</span>
            </h2>
            {contest.overview?.trim() ? (
              <MarkdownPreview statement={contest.overview} />
            ) : (
              <p className="contest-public-empty-description">
                주최측에서 대회 소개를 준비하고 있습니다.
              </p>
            )}
            {divisions.length > 0 ? (
              <div className="contest-public-divisions">
                <h3>
                  참가 부문 <span>{divisions.length}</span>
                </h3>
                <ul>
                  {[...divisions]
                    .sort(
                      (left, right) =>
                        (left.display_order ?? 0) - (right.display_order ?? 0),
                    )
                    .map((division) => (
                      <li key={division.division_id}>
                        <strong>{division.name}</strong>
                        {division.description?.trim() ? (
                          <p>{division.description}</p>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </section>

          <aside
            className="contest-public-access"
            aria-labelledby="contest-public-access-title"
          >
            <span className="contest-public-access-mark" aria-hidden="true">
              {'{ }'}
            </span>
            <h2 id="contest-public-access-title">이 대회의 참가자이신가요?</h2>
            <p>
              참가 계정으로 로그인하면 내 참가 정보와 참가자에게 공개된 자료를
              확인할 수 있습니다.
            </p>
            <Link
              className="contest-public-login"
              to={contestLoginPath(contest.contest_id, contestPath)}
            >
              참가 계정으로 로그인
              <OverviewIcon name="arrow" />
            </Link>
            <span className="contest-public-access-note">
              대회 소개와 공개 자료는 로그인 없이 볼 수 있어요.
            </span>
          </aside>
        </div>

        {ended ? (
          <section
            className="contest-public-resources"
            aria-labelledby="contest-public-resources-title"
          >
            <div className="contest-public-resources-heading">
              <div>
                <p className="contest-public-section-label">OPEN ARCHIVE</p>
                <h2 id="contest-public-resources-title">
                  누구나 볼 수 있는 대회 자료
                </h2>
              </div>
              <span>
                로그인 없이 둘러보세요
                <OverviewIcon name="arrow" />
              </span>
            </div>
            {resourceCards.length > 0 ? (
              <div className="contest-public-resource-grid">
                {resourceCards.map((resource) => (
                  <Link
                    className="contest-public-resource"
                    key={resource.path}
                    to={`${contestPath}/${resource.path}`}
                  >
                    <span className="contest-public-resource-icon">
                      <OverviewIcon name={resource.icon} />
                    </span>
                    <div>
                      <h3>{resource.title}</h3>
                      <p>{resource.description}</p>
                    </div>
                    <span className="contest-public-resource-arrow">
                      <OverviewIcon name="arrow" />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="contest-public-no-resources">
                아직 전체 공개된 자료가 없습니다. 참가자는 로그인 후 확인할 수
                있는 자료를 살펴보세요.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </ContestPageFrame>
  );
}
