import InterfaceIcon from '@/components/common/InterfaceIcon';
import PublicHero from '@/components/common/PublicHero';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useEffect, useMemo } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  ExperienceArrow,
  ExperienceReveal,
} from '@/components/common/PublicExperience';
import type { ServiceNotice } from '@/domains/serviceCommunication/types';
import { getPublicServiceNotices } from '@/domains/serviceCommunication/api';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import { formatDateTime } from '@/shared/lib/dateTime';
import './PublicExperience.css';
import './NoticesPage.css';

const NOTICE_PAGE_SIZE = 20;

export default function NoticesPage() {
  const [params] = useSearchParams();
  const { noticeId } = useParams<{ noticeId: string }>();
  const navigate = useNavigate();
  const visible = useDocumentVisibility();
  const requestedId = noticeId ?? params.get('noticeId') ?? '';
  const search = params.get('q') ?? '';
  const emergencyOnly = params.get('filter') === 'emergency';
  const requestedPage = Number(params.get('page'));
  const noticesQuery = useQuery({
    queryKey: ['public-service-notices'],
    queryFn: getPublicServiceNotices,
    refetchInterval: visible ? 15_000 : false,
    refetchIntervalInBackground: false,
  });
  const ordered = useMemo(
    () =>
      [...(noticesQuery.data ?? [])].sort(
        (a, b) =>
          Number(b.emergency) - Number(a.emergency) ||
          new Date(b.published_at).getTime() -
            new Date(a.published_at).getTime(),
      ),
    [noticesQuery.data],
  );
  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('ko-KR');
    return ordered.filter(
      (notice) =>
        (!emergencyOnly || notice.emergency) &&
        (!keyword ||
          `${notice.title}\n${notice.summary}\n${notice.body}`
            .toLocaleLowerCase('ko-KR')
            .includes(keyword)),
    );
  }, [ordered, search, emergencyOnly]);
  const selectedIndex = filtered.findIndex(
    (notice) => notice.service_notice_id === requestedId,
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / NOTICE_PAGE_SIZE));
  const currentPage =
    selectedIndex >= 0
      ? Math.floor(selectedIndex / NOTICE_PAGE_SIZE) + 1
      : Math.min(
          totalPages,
          Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1),
        );
  const pageNotices = filtered.slice(
    (currentPage - 1) * NOTICE_PAGE_SIZE,
    currentPage * NOTICE_PAGE_SIZE,
  );
  const selectedId = selectedIndex >= 0 ? requestedId : '';
  const missingRequested =
    !!requestedId &&
    !!noticesQuery.data &&
    !ordered.some((notice) => notice.service_notice_id === requestedId);
  const hiddenRequested =
    !!requestedId &&
    !!noticesQuery.data &&
    !missingRequested &&
    selectedIndex < 0;
  const emergencyCount = ordered.filter((notice) => notice.emergency).length;

  useEffect(() => {
    if (!selectedId) return;
    const frame = requestAnimationFrame(() => {
      const button = document.getElementById(`notice-toggle-${selectedId}`);
      button?.scrollIntoView({ block: 'start' });
      button?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId]);

  function updateFilter(key: 'q' | 'filter', value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('noticeId');
    next.delete('page');
    navigate(
      { pathname: '/notices', search: next.toString() },
      { replace: key === 'q', preventScrollReset: true },
    );
  }
  function noticeLocation(id?: string) {
    const next = new URLSearchParams(params);
    next.delete('noticeId');
    if (currentPage > 1) next.set('page', String(currentPage));
    else next.delete('page');
    return {
      pathname: id ? `/notices/${encodeURIComponent(id)}` : '/notices',
      search: next.toString(),
    };
  }
  function collapseNotice() {
    navigate(noticeLocation(), { preventScrollReset: true });
  }
  function changePage(page: number) {
    const next = new URLSearchParams(params);
    next.delete('noticeId');
    if (page > 1) next.set('page', String(page));
    else next.delete('page');
    navigate(
      { pathname: '/notices', search: next.toString() },
      { preventScrollReset: true },
    );
    document
      .getElementById('notice-list-heading')
      ?.focus({ preventScroll: true });
    document.getElementById('notice-list')?.scrollIntoView({ block: 'start' });
  }
  function resetFilters() {
    navigate(
      requestedId && !missingRequested
        ? `/notices/${encodeURIComponent(requestedId)}`
        : '/notices',
      { preventScrollReset: true },
    );
  }

  return (
    <div className="public-experience notices-experience">
      <PublicHero className="notices-hero">
        <div className="experience-hero-grid">
          <div className="experience-hero-copy">
            <p className="experience-eyebrow">KEEP IN THE LOOP</p>
            <h1>
              새로운 소식,
              <br />
              놓치지 않도록<span className="experience-lime">.</span>
            </h1>
            <p className="experience-lead">
              서비스 소식부터 꼭 알아둘 안내까지.
              <br />
              ZOJ의 이야기를 한곳에서 확인하세요.
            </p>
            <a className="experience-text-link" href="#notice-list">
              공지사항 살펴보기 <ExperienceArrow />
            </a>
          </div>
          <div className="notices-art" aria-hidden="true">
            <div className="notices-art-orbit" />
            <div className="notices-art-sheet">
              <div>
                <span>ZOJ NEWS</span>
                <i>
                  <InterfaceIcon name="arrowUpRight" />
                </i>
              </div>
              <span className="notices-art-line is-wide" />
              <span className="notices-art-line" />
              <div className="notices-art-body">
                <span />
                <span />
                <span />
              </div>
              <div className="notices-art-stamp">
                새로운 소식이
                <br />
                도착했어요.
              </div>
            </div>
            <div className="notices-art-tag">
              <span>
                <InterfaceIcon name="asterisk" />
              </span>{' '}
              알아두면 좋은 이야기
            </div>
            <span className="notices-art-spark">
              <InterfaceIcon name="sparkle" />
            </span>
          </div>
        </div>
      </PublicHero>

      <section
        className="experience-container experience-section notices-content"
        id="notice-list"
      >
        <div className="experience-section-heading">
          <div>
            <p className="experience-eyebrow">FROM ZOJ</p>
            <h2 id="notice-list-heading" tabIndex={-1}>
              공지사항
            </h2>
          </div>
          <p>
            긴급한 안내를 먼저 보여드려요.
            <br />
            제목을 누르면 자세한 내용을 읽을 수 있습니다.
          </p>
        </div>
        <div className="notices-toolbar">
          <div className="notices-filters" role="group" aria-label="공지 유형">
            <button
              aria-pressed={!emergencyOnly}
              onClick={() => updateFilter('filter', '')}
              type="button"
            >
              전체 <span>{noticesQuery.data ? ordered.length : '—'}</span>
            </button>
            <button
              aria-pressed={emergencyOnly}
              onClick={() => updateFilter('filter', 'emergency')}
              type="button"
            >
              긴급 안내 <span>{noticesQuery.data ? emergencyCount : '—'}</span>
            </button>
          </div>
          <div className="notices-search">
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
            <label className="sr-only" htmlFor="notice-search">
              공지 검색
            </label>
            <input
              id="notice-search"
              type="search"
              value={search}
              onChange={(event) => updateFilter('q', event.target.value)}
              placeholder="제목이나 내용으로 찾아보세요"
            />
            {search ? (
              <button
                aria-label="검색어 지우기"
                onClick={() => updateFilter('q', '')}
                type="button"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>

        {noticesQuery.isError ? (
          <div className="notices-message is-error" role="alert">
            <div>
              <strong>
                {noticesQuery.data
                  ? '새로운 소식을 확인하지 못했어요.'
                  : '공지사항을 불러오지 못했어요.'}
              </strong>
              <p>
                {noticesQuery.data
                  ? '지금 보이는 내용은 마지막으로 가져온 공지입니다.'
                  : '잠시 후 다시 시도해 주세요.'}
              </p>
            </div>
            <button
              disabled={noticesQuery.isFetching}
              onClick={() => void noticesQuery.refetch()}
              type="button"
            >
              {noticesQuery.isFetching ? (
                '확인 중…'
              ) : (
                <>
                  다시 확인하기 <InterfaceIcon name="refresh" />
                </>
              )}
            </button>
          </div>
        ) : null}
        {missingRequested || hiddenRequested ? (
          <div className="notices-message" role="status">
            <div>
              <strong>
                {missingRequested
                  ? '요청한 공지를 찾을 수 없어요.'
                  : '선택한 공지가 검색 조건에 가려져 있어요.'}
              </strong>
              <p>
                {missingRequested
                  ? '삭제되었거나 주소가 변경되었을 수 있습니다. 다른 소식을 확인해 주세요.'
                  : '검색 조건을 초기화하면 해당 공지를 볼 수 있습니다.'}
              </p>
            </div>
            <button type="button" onClick={resetFilters}>
              {missingRequested ? '전체 공지 보기' : '검색 초기화'}
            </button>
          </div>
        ) : null}
        {noticesQuery.isPending ? (
          <div className="notices-loading" role="status">
            <span>새로운 소식을 불러오고 있어요.</span>
            <div aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <i />
                  <span />
                  <b />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {noticesQuery.data ? (
          <>
            <div className="notices-list-meta" role="status">
              <span>
                {search.trim()
                  ? `“${search.trim()}” 검색 결과`
                  : '확인할 수 있는 소식'}{' '}
                <strong>{filtered.length}개</strong>
              </span>
              <span>최근 소식 순</span>
            </div>
            {pageNotices.length ? (
              <ul className="notices-list">
                {pageNotices.map((notice) => (
                  <NoticeRow
                    key={notice.service_notice_id}
                    notice={notice}
                    expanded={requestedId === notice.service_notice_id}
                    to={noticeLocation(notice.service_notice_id)}
                    onCollapse={collapseNotice}
                  />
                ))}
              </ul>
            ) : (
              <div className="notices-empty">
                <span aria-hidden="true">
                  <InterfaceIcon name={ordered.length ? 'search' : 'mail'} />
                </span>
                <h3>
                  {ordered.length
                    ? '찾으시는 공지가 없어요.'
                    : '아직 등록된 소식이 없어요.'}
                </h3>
                <p>
                  {ordered.length
                    ? '다른 검색어로 찾아보거나 전체 공지를 확인해 주세요.'
                    : '새로운 소식이 등록되면 이곳에서 안내해 드릴게요.'}
                </p>
                {ordered.length ? (
                  <button
                    className="experience-text-link"
                    onClick={() =>
                      navigate('/notices', { preventScrollReset: true })
                    }
                    type="button"
                  >
                    전체 공지 보기 <ExperienceArrow />
                  </button>
                ) : null}
              </div>
            )}
            {totalPages > 1 ? (
              <Pagination
                current={currentPage}
                total={totalPages}
                onChange={changePage}
              />
            ) : null}
          </>
        ) : null}
        <p className="notices-update-note">
          이 화면이 열려 있는 동안 새로운 공지를 주기적으로 확인합니다.
        </p>
      </section>

      <section className="experience-soft-section">
        <div className="experience-container notices-bottom">
          <ExperienceReveal className="notices-bottom-grid">
            <div>
              <p className="experience-eyebrow">LOOKING FOR SOMETHING?</p>
              <h2>
                대회 소식과 이용 안내도
                <br />
                가까이에 있어요.
              </h2>
              <p>
                대회별 공지와 문제 관련 질문은 해당 대회 게시판에서 확인해
                주세요.
              </p>
            </div>
            <div className="notices-quick-links">
              <Link to="/contests">
                <span>
                  참가 중인 대회의 소식<strong>대회 목록</strong>
                </span>
                <ExperienceArrow />
              </Link>
              <Link to="/support/help">
                <span>
                  서비스 이용 중 궁금한 점<strong>도움말</strong>
                </span>
                <ExperienceArrow />
              </Link>
            </div>
          </ExperienceReveal>
        </div>
      </section>
    </div>
  );
}

function NoticeRow({
  notice,
  expanded,
  to,
  onCollapse,
}: {
  notice: ServiceNotice;
  expanded: boolean;
  to: { pathname: string; search: string };
  onCollapse: () => void;
}) {
  const id = notice.service_notice_id;
  return (
    <li
      className={`notices-row ${expanded ? 'is-expanded' : ''} ${notice.emergency ? 'is-emergency' : ''}`}
    >
      <h3>
        <Link
          className="notices-row-toggle"
          id={`notice-toggle-${id}`}
          aria-expanded={expanded}
          aria-controls={`notice-body-${id}`}
          to={to}
          preventScrollReset
          onClick={(event) => {
            if (
              expanded &&
              event.button === 0 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            ) {
              event.preventDefault();
              onCollapse();
            }
          }}
        >
          <span
            className={`notices-badge ${notice.emergency ? 'is-emergency' : ''}`}
          >
            {notice.emergency ? '긴급 안내' : '공지'}
          </span>
          <span className="notices-row-copy">
            <strong>{notice.title}</strong>
            {notice.summary ? <span>{notice.summary}</span> : null}
          </span>
          <time dateTime={notice.published_at}>
            {formatDateTime(notice.published_at)}
          </time>
          <span className="notices-row-plus" aria-hidden="true">
            +
          </span>
        </Link>
      </h3>
      <div
        id={`notice-body-${id}`}
        role="region"
        aria-labelledby={`notice-toggle-${id}`}
        hidden={!expanded}
      >
        {expanded ? (
          <article className="notices-body">
            {notice.summary ? (
              <div className="notices-summary">
                <span>한눈에 보기</span>
                <p>{notice.summary}</p>
              </div>
            ) : null}
            <div className="notices-body-text">
              {notice.body ||
                '별도로 등록된 본문이 없습니다. 위 안내 내용을 확인해 주세요.'}
            </div>
            <div className="notices-body-footer">
              <span>ZOJ 서비스 공지</span>
              <button
                onClick={() => {
                  onCollapse();
                  document
                    .getElementById(`notice-toggle-${id}`)
                    ?.focus({ preventScroll: true });
                }}
                type="button"
              >
                접기 <InterfaceIcon name="arrowUp" />
              </button>
            </div>
          </article>
        ) : null}
      </div>
    </li>
  );
}

function Pagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  return (
    <nav className="notices-pagination" aria-label="공지사항 페이지">
      <button
        aria-label="이전 페이지"
        disabled={current <= 1}
        onClick={() => onChange(current - 1)}
        type="button"
      >
        <InterfaceIcon name="arrowLeft" />
      </button>
      {pages.map((page, i) => (
        <Fragment key={page}>
          {i > 0 && page - pages[i - 1] > 1 ? (
            <span aria-hidden="true">…</span>
          ) : null}
          <button
            aria-label={`${page}페이지`}
            aria-current={current === page ? 'page' : undefined}
            onClick={() => onChange(page)}
            type="button"
          >
            {page}
          </button>
        </Fragment>
      ))}
      <button
        aria-label="다음 페이지"
        disabled={current >= total}
        onClick={() => onChange(current + 1)}
        type="button"
      >
        <InterfaceIcon name="arrowRight" />
      </button>
    </nav>
  );
}
