import InterfaceIcon from '@/components/common/InterfaceIcon';
import PublicHero from '@/components/common/PublicHero';
import { hasParticipantPreviewAccess } from '@/domains/identityAccess/participantPreview';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ExperienceArrow,
  ExperienceReveal,
} from '@/components/common/PublicExperience';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import './PublicExperience.css';
import './ContestsPage.css';
import ContestListItem from '@/components/ui/ContestListItem';
import {
  getOperatorContests,
  getPublicContests,
} from '@/domains/contestAdministration/api';
import {
  contestAccessPhase,
  isContestHiddenFromPublic,
} from '@/domains/contestAdministration/logic';
import { toContestCardData } from '@/domains/contestAdministration/presentation';
import type { Contest } from '@/domains/contestAdministration/types';
import { isServiceMaster } from '@/domains/identityAccess/permissions';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import { useRefreshGeneralSession } from '@/domains/identityAccess/useRefreshGeneralSession';

type ContestFilter = 'all' | 'mine';
type ContestSectionKey = 'running' | 'upcoming' | 'ended';

type ContestSection = {
  contests: Contest[];
  description: string;
  key: ContestSectionKey;
  title: string;
};

const contestSections: Omit<ContestSection, 'contests'>[] = [
  {
    description: '현재 진행 중인 대회입니다.',
    key: 'running',
    title: '진행 중인 대회',
  },
  {
    description: '시작 예정인 대회입니다.',
    key: 'upcoming',
    title: '시작을 기다리는 대회',
  },
  {
    description: '종료된 대회입니다. 자료 공개 범위는 대회 설정을 따릅니다.',
    key: 'ended',
    title: '종료된 대회',
  },
];

function sectionKeyForContest(contest: Contest): ContestSectionKey {
  const phase = contestAccessPhase(contest);
  if (phase === 'running') return 'running';
  if (phase === 'ended') return 'ended';
  return 'upcoming';
}

function contestSortDate(contest: Contest) {
  const sectionKey = sectionKeyForContest(contest);
  const value = sectionKey === 'ended' ? contest.end_at : contest.start_at;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortContestsByRecentDate(contests: Contest[]) {
  return [...contests].sort((a, b) => {
    if (
      sectionKeyForContest(a) === 'upcoming' &&
      sectionKeyForContest(b) === 'upcoming'
    ) {
      const aTbd = contestAccessPhase(a) === 'schedule_tbd';
      const bTbd = contestAccessPhase(b) === 'schedule_tbd';
      return (
        Number(aTbd) - Number(bTbd) || contestSortDate(a) - contestSortDate(b)
      );
    }
    return contestSortDate(b) - contestSortDate(a);
  });
}

export default function ContestsPage() {
  const [filter, setFilter] = useState<ContestFilter>('all');
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<ContestSectionKey | 'all'>(
    'all',
  );
  const isDocumentVisible = useDocumentVisibility();
  useRefreshGeneralSession();
  const generalSession = useSessionStore((state) => state.generalSession);
  const participantSession = useSessionStore(
    (state) => state.participantSession,
  );
  const directoryToken =
    generalSession?.accessToken ?? participantSession?.accessToken;
  const operatorToken = generalSession?.operatorSession?.accessToken;
  const operatorQueryIdentity = tokenQueryIdentity(operatorToken);
  const contestsQuery = useQuery({
    queryKey: ['public-contests', tokenQueryIdentity(directoryToken)],
    queryFn: () => getPublicContests(directoryToken),
    refetchInterval: isDocumentVisible ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const operatorContestsQuery = useQuery({
    enabled: Boolean(operatorToken),
    queryKey: ['operator', 'contests', operatorQueryIdentity],
    queryFn: () => getOperatorContests(operatorToken!),
    refetchInterval: isDocumentVisible ? 15_000 : false,
    refetchIntervalInBackground: false,
  });

  const operatorContests =
    operatorContestsQuery.data ??
    generalSession?.operatorContests.map((entry) => entry.contest) ??
    [];
  const contestById = new Map<string, Contest>();
  for (const contest of contestsQuery.data ?? []) {
    contestById.set(contest.contest_id, contest);
  }
  const previewContests =
    generalSession?.operatorContests
      .filter((entry) =>
        hasParticipantPreviewAccess(generalSession, entry.contest.contest_id),
      )
      .map((entry) => entry.contest) ?? [];
  for (const contest of [...operatorContests, ...previewContests]) {
    contestById.set(contest.contest_id, contest);
  }
  const contests = sortContestsByRecentDate([...contestById.values()]);
  const participantContestIds = new Set(
    generalSession?.participantContests.map(
      (item) => item.contest.contest_id,
    ) ?? [],
  );
  const operatorContestIds = new Set(
    [...operatorContests, ...previewContests].map(
      (contest) => contest.contest_id,
    ),
  );
  const canOperateAllContests = Boolean(
    generalSession && isServiceMaster(generalSession),
  );
  const visibleContests =
    filter === 'mine'
      ? canOperateAllContests
        ? contests
        : contests.filter(
            (contest) =>
              participantContestIds.has(contest.contest_id) ||
              operatorContestIds.has(contest.contest_id),
          )
      : contests;
  const keyword = search.trim().toLocaleLowerCase('ko-KR');
  const searchedContests = visibleContests.filter(
    (contest) =>
      !keyword ||
      `${contest.title} ${contest.organization_name}`
        .toLocaleLowerCase('ko-KR')
        .includes(keyword),
  );
  const phaseCounts = Object.fromEntries(
    contestSections.map((section) => [
      section.key,
      searchedContests.filter(
        (contest) => sectionKeyForContest(contest) === section.key,
      ).length,
    ]),
  );
  const sections = contestSections
    .filter((section) => phaseFilter === 'all' || phaseFilter === section.key)
    .map((section) => ({
      ...section,
      contests: sortContestsByRecentDate(
        searchedContests.filter(
          (contest) => sectionKeyForContest(contest) === section.key,
        ),
      ),
    }));

  const displayedCount = sections.reduce(
    (total, section) => total + section.contests.length,
    0,
  );
  const waiting =
    contestsQuery.isLoading ||
    (Boolean(operatorToken) && operatorContestsQuery.isLoading);
  const failed = contestsQuery.isError || operatorContestsQuery.isError;
  const showSignIn = filter === 'mine' && !generalSession;
  function clearFilters() {
    setSearch('');
    setPhaseFilter('all');
  }

  return (
    <div className="public-experience contest-directory">
      <PublicHero className="directory-hero">
        <div className="experience-hero-grid">
          <div className="experience-hero-copy">
            <p className="experience-eyebrow">CONTESTS</p>
            <h1>대회 목록</h1>
            <p className="experience-lead">
              진행 중인 대회, 예정된 대회와 종료된 대회를 조회합니다.
            </p>
            <a className="experience-text-link" href="#contest-directory">
              대회 둘러보기 <ExperienceArrow />
            </a>
          </div>
          <div className="directory-art" aria-hidden="true">
            <div className="directory-art-orbit" />
            <div className="directory-art-ticket">
              <div>
                <span>ZOJ CONTEST</span>
                <span>
                  <InterfaceIcon name="arrowUpRight" />
                </span>
              </div>
              <p>
                READY.
                <br />
                SET.
                <br />
                <strong>CODE.</strong>
              </p>
              <div className="directory-art-ticket-bottom">
                <span>CONTESTS</span>
                <i />
              </div>
            </div>
            <div className="directory-art-code">&lt;/&gt;</div>
            <div className="directory-art-label">
              <span>
                <InterfaceIcon name="asterisk" />
              </span>{' '}
              대회 일정
            </div>
          </div>
        </div>
      </PublicHero>
      <section
        className="experience-container experience-section directory-content"
        id="contest-directory"
      >
        <div className="experience-section-heading">
          <div>
            <p className="experience-eyebrow">대회 검색</p>
            <h2>대회 목록</h2>
          </div>
          <p>
            참가하거나 운영하는 대회는
            <br />
            ‘내 대회’에서 모아볼 수 있습니다.
          </p>
        </div>
        <div className="directory-toolbar">
          <div className="directory-scope" role="group" aria-label="대회 범위">
            {[
              ['all', '전체 대회'],
              ['mine', '내 대회'],
            ].map(([value, label]) => (
              <button
                aria-pressed={filter === value}
                onClick={() => setFilter(value as ContestFilter)}
                type="button"
                key={value}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="directory-search">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 5 5" />
            </svg>
            <label className="sr-only" htmlFor="contest-directory-search">
              대회 검색
            </label>
            <input
              id="contest-directory-search"
              type="search"
              placeholder="대회명이나 주최 기관으로 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button
                aria-label="검색어 지우기"
                onClick={() => setSearch('')}
                type="button"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
        <div
          className="directory-phases"
          role="group"
          aria-label="대회 진행 상태"
        >
          {[
            ['all', '모든 일정'],
            ['running', '진행 중'],
            ['upcoming', '시작 예정'],
            ['ended', '종료'],
          ].map(([value, label]) => (
            <button
              aria-pressed={phaseFilter === value}
              onClick={() => setPhaseFilter(value as ContestSectionKey | 'all')}
              key={value}
              type="button"
            >
              {value !== 'all' ? <i className={`is-${value}`} /> : null}
              {label}
              <span>
                {waiting && !contests.length
                  ? '—'
                  : value === 'all'
                    ? searchedContests.length
                    : phaseCounts[value]}
              </span>
            </button>
          ))}
        </div>
        {failed ? (
          <div className="directory-message is-error" role="alert">
            <div>
              <strong>
                {contests.length
                  ? '일부 대회 정보를 갱신하지 못했어요.'
                  : '대회 목록을 불러오지 못했어요.'}
              </strong>
              <p>
                {contests.length
                  ? '지금 보이는 정보를 참고하고 잠시 후 다시 확인해 주세요.'
                  : '연결 상태를 확인한 뒤 다시 시도해 주세요.'}
              </p>
            </div>
            <button
              disabled={
                contestsQuery.isFetching || operatorContestsQuery.isFetching
              }
              onClick={() => {
                void contestsQuery.refetch();
                if (operatorToken) void operatorContestsQuery.refetch();
              }}
              type="button"
            >
              다시 확인하기 <InterfaceIcon name="refresh" />
            </button>
          </div>
        ) : null}
        {showSignIn ? (
          <div className="directory-empty">
            <span aria-hidden="true">
              <InterfaceIcon name="arrowUpRight" />
            </span>
            <h3>내 대회 조회</h3>
            <p>
              등록된 이메일로 로그인하면 참가 중인 대회와 운영하는 대회를 확인할
              수 있습니다.
            </p>
            <Link
              className="experience-button is-dark"
              to="/login?moveTo=%2Fcontests"
            >
              로그인하기 <ExperienceArrow />
            </Link>
          </div>
        ) : (
          <>
            {waiting && !contests.length ? (
              <div className="directory-loading" role="status">
                <p>대회 일정을 불러오는 중입니다.</p>
                <div aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i}>
                      <i />
                      <span>
                        <b />
                        <b />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="directory-sections">
              {sections.map((section) =>
                section.contests.length ? (
                  <section
                    className={`directory-section is-${section.key}`}
                    key={section.key}
                  >
                    <header>
                      <div>
                        <h2>{section.title}</h2>
                        <p>{section.description}</p>
                      </div>
                      <span>{section.contests.length}개</span>
                    </header>
                    <ul>
                      {section.contests.map((contest) => {
                        const isOperatorContest =
                          canOperateAllContests ||
                          operatorContestIds.has(contest.contest_id);
                        return (
                          <ContestListItem
                            key={contest.contest_id}
                            href={
                              isOperatorContest
                                ? `/operator/contests/${encodeURIComponent(contest.contest_id)}`
                                : undefined
                            }
                            operatorOnlyVisible={
                              isOperatorContest &&
                              isContestHiddenFromPublic(contest)
                            }
                            directoryMeta={{
                              phase: section.key,
                              startAt: contest.start_at,
                              endAt: contest.end_at,
                              scheduleTbd:
                                contestAccessPhase(contest) === 'schedule_tbd',
                            }}
                            {...toContestCardData(contest)}
                          />
                        );
                      })}
                    </ul>
                  </section>
                ) : null,
              )}
            </div>
            {!waiting && !failed && displayedCount === 0 ? (
              <div className="directory-empty">
                <span aria-hidden="true">
                  <InterfaceIcon
                    name={
                      search || phaseFilter !== 'all' ? 'search' : 'asterisk'
                    }
                  />
                </span>
                <h3>
                  {search || phaseFilter !== 'all'
                    ? '조건에 맞는 대회가 없습니다.'
                    : filter === 'mine'
                      ? '등록된 대회가 없습니다.'
                      : '공개된 대회가 없습니다.'}
                </h3>
                <p>
                  {search || phaseFilter !== 'all'
                    ? '다른 검색어나 일정으로 다시 찾아보세요.'
                    : filter === 'mine'
                      ? '참가 등록에 사용한 이메일이 맞는지 확인해 주세요.'
                      : '공개된 대회는 이 목록에 표시됩니다.'}
                </p>
                {search || phaseFilter !== 'all' ? (
                  <button
                    className="experience-text-link"
                    onClick={clearFilters}
                    type="button"
                  >
                    검색 조건 초기화 <ExperienceArrow />
                  </button>
                ) : filter === 'mine' ? (
                  <button
                    className="experience-text-link"
                    onClick={() => setFilter('all')}
                    type="button"
                  >
                    전체 대회 둘러보기 <ExperienceArrow />
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>
      <section className="experience-soft-section">
        <div className="experience-container directory-guide">
          <ExperienceReveal className="directory-guide-inner">
            <div>
              <p className="experience-eyebrow">참가 안내</p>
              <h2>대회 참가 방법</h2>
              <p>
                로그인, 코드 제출, 결과 확인 방법은 이용안내에서 확인할 수
                있습니다.
              </p>
            </div>
            <Link className="experience-button is-dark" to="/support">
              참가 방법 알아보기 <ExperienceArrow />
            </Link>
          </ExperienceReveal>
        </div>
      </section>
    </div>
  );
}
