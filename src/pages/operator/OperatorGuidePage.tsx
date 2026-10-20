import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import {
  OperatorAccessGate,
  OperatorTabs,
} from '@/components/operator/OperatorShell';
import { GuideIcon } from '@/components/operator/guide/GuideIcon';
import JudgeServerReference from '@/components/operator/guide/JudgeServerReference';
import {
  operatorGuideCategories,
  searchOperatorGuide,
  type GuideArticle,
} from '@/data/operatorGuideContent';
import { hasContestPermission } from '@/domains/identityAccess/permissions';
import type { StaffSession } from '@/domains/identityAccess/types';
import './OperatorGuidePage.css';

const articleCount = operatorGuideCategories.reduce(
  (total, category) => total + category.articles.length,
  0,
);

export default function OperatorGuidePage() {
  const { contestId } = useParams();
  return (
    <OperatorAccessGate contestId={contestId}>
      {(session) =>
        contestId ? (
          <GuideContent contestId={contestId} session={session} />
        ) : (
          <PageLayout title="대회를 먼저 선택해 주세요">
            <Link to="/operator">운영할 대회 선택하기</Link>
          </PageLayout>
        )
      }
    </OperatorAccessGate>
  );
}

function GuideContent({
  contestId,
  session,
}: {
  contestId: string;
  session: StaffSession;
}) {
  const [params, setParams] = useSearchParams();
  const [copied, setCopied] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const contentRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastNavigation = useRef<string | null>(null);
  const section = params.get('section') ?? 'start';
  const selectedArticle = params.get('article');
  const query = params.get('q') ?? '';
  const category =
    operatorGuideCategories.find((item) => item.id === section) ??
    operatorGuideCategories[0];
  const categoryIndex = operatorGuideCategories.indexOf(category);
  const results = searchOperatorGuide(query);
  const nextCategory = operatorGuideCategories[categoryIndex + 1];
  const canVisit =
    category.route !== undefined &&
    hasContestPermission(session, contestId, category.permission);
  const validArticle = category.articles.find(
    (article) => article.id === selectedArticle,
  );

  useEffect(() => {
    const navigation = `${category.id}:${selectedArticle ?? ''}:${query}`;
    if (lastNavigation.current === navigation) return;
    const firstVisit = lastNavigation.current === null;
    lastNavigation.current = navigation;
    // Strict Mode re-runs effects; only a new navigation should scroll.
    if (query || (firstVisit && !selectedArticle && !params.has('section')))
      return;
    const target = selectedArticle
      ? (document.getElementById(`guide-${selectedArticle}`) ??
        contentRef.current)
      : contentRef.current;
    target?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  }, [category.id, selectedArticle, query, params]);

  function goTo(id: string, article?: string) {
    const next = new URLSearchParams({ section: id });
    if (article) next.set('article', article);
    setParams(next);
    setCopied('');
  }
  function search(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  }
  async function copyLink(article?: string) {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      section: category.id,
      ...(article ? { article } : {}),
    }).toString();
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(article ?? 'section');
    } catch {
      setCopied('failed');
    }
  }

  return (
    <PageLayout
      variant="management"
      title="운영 가이드"
      description="설정·채점·대회 운영의 사용법과 문제 대처 안내입니다."
      width="full"
    >
      <OperatorTabs contestId={contestId} />
      <div className="operator-guide">
        <header className="og-hero">
          <div className="og-hero-copy">
            <span className="og-eyebrow">
              <span /> ZOJ OPERATOR HANDBOOK
            </span>
            <h2>
              기능별로 살펴보는
              <br />
              <em>ZOJ 대회 운영</em>
            </h2>
            <p>
              각 기능의 설정 방법과 적용 결과를 확인하세요.
              <br className="og-desktop-break" /> 참가자에게 표시되는 내용과
              문제 발생 시 대처 방법을 함께 안내합니다.
            </p>
            <div className="og-hero-meta">
              <span>
                <strong>{operatorGuideCategories.length}</strong>가지 카테고리
              </span>
              <i />
              <span>
                <strong>{articleCount}</strong>개의 상세 안내
              </span>
              <i />
              <span>설정 방법부터 문제 대처까지</span>
            </div>
            <a href="#operator-guide-content" className="og-start-link">
              화면별 사용법 보기 <GuideIcon kind="arrow" />
            </a>
          </div>
        </header>
        <div className="og-find-bar">
          <div className="og-search">
            <GuideIcon kind="search" />
            <label className="sr-only" htmlFor="operator-guide-search">
              운영 가이드 검색
            </label>
            <input
              ref={searchRef}
              id="operator-guide-search"
              type="search"
              value={query}
              placeholder="궁금한 기능이나 증상을 검색하세요"
              onChange={(event) => search(event.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  search('');
                  searchRef.current?.focus();
                }}
                aria-label="검색어 지우기"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="og-popular">
          <span>많이 찾는 안내</span>
          {[
            '프리즈',
            '로그아웃',
            '모의채점',
            '참가 유형',
            '메일',
            '채점 서버',
          ].map((word) => (
            <button
              key={word}
              type="button"
              onClick={() => {
                search(word);
                searchRef.current?.focus();
              }}
            >
              {word}{' '}
              <span>
                <InterfaceIcon name="arrowUpRight" />
              </span>
            </button>
          ))}
        </div>
        <div className="og-layout">
          <aside className="og-sidebar">
            <div className="og-sidebar-label">
              운영 가이드 목차 <span>{operatorGuideCategories.length}</span>
            </div>
            <nav aria-label="가이드 카테고리">
              {operatorGuideCategories.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  aria-current={
                    !query && category.id === item.id ? 'page' : undefined
                  }
                  onClick={() => goTo(item.id)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{item.label}</strong>
                  <small>{item.articles.length}</small>
                </button>
              ))}
            </nav>
            <div className="og-sidebar-help">
              <GuideIcon kind="info" />
              <p>
                보이는 메뉴가 다른가요?
                <br />
                역할에 따라 사용할 수 있는
                <br className="og-desktop-break" /> 메뉴와 기능이 달라집니다.
              </p>
              <button
                type="button"
                onClick={() => goTo('operators', 'missing-menu')}
              >
                권한 안내 보기 <InterfaceIcon name="arrowRight" />
              </button>
            </div>
          </aside>
          <section
            className="og-content"
            id="operator-guide-content"
            ref={contentRef}
            aria-label={query ? '가이드 검색 결과' : category.title}
          >
            {query ? (
              <div className="og-search-results">
                <div className="og-section-kicker">가이드 검색</div>
                <h2>
                  “{query}” 검색 결과 <span>{results.length}</span>
                </h2>
                <p role="status">제목, 설정 방법, 주의사항에서 찾았습니다.</p>
                {results.length ? (
                  results.map(({ category: resultCategory, article }) => (
                    <button
                      className="og-search-result"
                      type="button"
                      key={article.id}
                      onClick={() => goTo(resultCategory.id, article.id)}
                    >
                      <span>{resultCategory.label}</span>
                      <strong>
                        {article.title}
                        <GuideIcon kind="arrow" />
                      </strong>
                      <p>{article.summary}</p>
                    </button>
                  ))
                ) : (
                  <div className="og-empty">
                    <GuideIcon kind="search" />
                    <h3>일치하는 안내가 없습니다</h3>
                    <p>
                      “프리즈”, “공개”, “로그인”, “채점”처럼 짧은 단어로
                      찾아보세요.
                    </p>
                    <button type="button" onClick={() => search('')}>
                      전체 가이드 보기
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <header className="og-category-header">
                  <div className="og-section-kicker">
                    CHAPTER {String(categoryIndex + 1).padStart(2, '0')}{' '}
                    <span>
                      {' '}
                      /{' '}
                      {String(operatorGuideCategories.length).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="og-category-title">
                    <h2>{category.title}</h2>
                    <button
                      type="button"
                      onClick={() => copyLink()}
                      className="og-copy"
                    >
                      {copied === 'section' ? (
                        <>
                          복사 완료 <InterfaceIcon name="check" />
                        </>
                      ) : (
                        '안내 링크 복사'
                      )}
                    </button>
                  </div>
                  <p>{category.description}</p>
                  {canVisit ? (
                    <Link
                      className="og-text-link"
                      to={`/operator/contests/${contestId}${category.route ? `/${category.route}` : ''}`}
                    >
                      실제 {category.label.split(' · ')[0]} 화면 열기{' '}
                      <GuideIcon kind="arrow" />
                    </Link>
                  ) : category.route !== undefined ? (
                    <p className="og-permission-note">
                      <GuideIcon kind="lock" /> 해당 관리 화면을 열려면 담당
                      권한이 필요합니다. 안내는 계속 읽을 수 있습니다.
                    </p>
                  ) : null}
                </header>
                {category.id === 'judge-servers' && <JudgeServerReference />}
                <nav
                  className="og-article-toc"
                  aria-label="이 카테고리의 상세 안내"
                >
                  <span>이 페이지에서</span>
                  {category.articles.map((article, index) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => goTo(category.id, article.id)}
                    >
                      {index + 1}. {article.title}
                      <span>
                        <InterfaceIcon name="arrowDown" />
                      </span>
                    </button>
                  ))}
                </nav>
                <div className="og-articles">
                  {category.articles.map((article, index) => (
                    <GuideArticleCard
                      key={`${category.id}:${article.id}:${validArticle?.id ?? ''}`}
                      article={article}
                      index={index}
                      initiallyOpen={
                        index === 0 || article.id === selectedArticle
                      }
                      copied={copied === article.id}
                      onCopy={() => copyLink(article.id)}
                    />
                  ))}
                </div>
                <div className="og-checklist">
                  <div>
                    <span className="og-eyebrow">마지막으로 확인하세요</span>
                    <h3>이 단계의 체크리스트</h3>
                    <p>이 화면에서 점검 표시만 합니다.</p>
                  </div>
                  <div>
                    {category.checklist.map((item, index) => {
                      const id = `${category.id}-${index}`;
                      return (
                        <label key={item}>
                          <input
                            type="checkbox"
                            checked={checked.includes(id)}
                            onChange={() =>
                              setChecked((value) =>
                                value.includes(id)
                                  ? value.filter((entry) => entry !== id)
                                  : [...value, id],
                              )
                            }
                          />
                          <span>{item}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {nextCategory && (
                  <button
                    className="og-next-chapter"
                    type="button"
                    onClick={() => goTo(nextCategory.id)}
                  >
                    <span>
                      <small>다음 가이드</small>
                      <strong>{nextCategory.label}</strong>
                    </span>
                    <GuideIcon kind="arrow" />
                  </button>
                )}
              </>
            )}
            <p className="og-copy-status" role="status">
              {copied === 'failed'
                ? '링크를 복사하지 못했습니다. 브라우저 주소창의 주소를 복사해 주세요.'
                : copied
                  ? '가이드 링크를 복사했습니다.'
                  : ''}
            </p>
          </section>
        </div>
        <footer className="og-footer">
          <GuideIcon />
          <div>
            <strong>설정 변경 시 확인 사항</strong>
            <p>
              설정 변경 전 영향 범위를 확인하고, 필요한 안내를 담당 운영진과
              공유하세요.
            </p>
          </div>
          <Link to="/support/contact">
            고객지원 <GuideIcon kind="arrow" />
          </Link>
        </footer>
      </div>
    </PageLayout>
  );
}

function GuideArticleCard({
  article,
  index,
  initiallyOpen,
  copied,
  onCopy,
}: {
  article: GuideArticle;
  index: number;
  initiallyOpen: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <article
      id={`guide-${article.id}`}
      className={`og-article ${open ? 'is-open' : ''}`}
    >
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`guide-body-${article.id}`}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="og-article-number">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span>
            <strong>{article.title}</strong>
            <small>{article.summary}</small>
          </span>
          <span className="og-expand">{open ? '−' : '+'}</span>
        </button>
      </h3>
      <div
        id={`guide-body-${article.id}`}
        hidden={!open}
        className="og-article-body"
      >
        <div className="og-instructions">
          <h4>{article.stepsTitle ?? '이렇게 설정하세요'}</h4>
          <ol>
            {article.steps.map((step, stepIndex) => (
              <li key={step}>
                <span>{stepIndex + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="og-effect">
          <GuideIcon kind="spark" />
          <div>
            <h4>{article.effectTitle ?? '설정하면 이렇게 달라져요'}</h4>
            <p>{article.effect}</p>
          </div>
        </div>
        {article.table && (
          <div
            className="og-table-scroll"
            role="region"
            aria-label={`${article.title} 비교표`}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {article.table.headers.map((header) => (
                    <th scope="col" key={header}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {article.table.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, cellIndex) =>
                      cellIndex === 0 ? (
                        <th scope="row" key={cellIndex}>
                          {cell}
                        </th>
                      ) : (
                        <td key={cellIndex}>{cell}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {article.example && (
          <div className="og-example">
            <h4>예를 들면</h4>
            <pre>{article.example}</pre>
          </div>
        )}
        {article.note && (
          <div className="og-note">
            <GuideIcon kind="info" />
            <div>
              <h4>함께 알아두세요</h4>
              <p>{article.note}</p>
            </div>
          </div>
        )}
        {article.references?.length ? (
          <div className="og-references">
            <h4>참고 문서</h4>
            <ul>
              {article.references.map((reference) => (
                <li key={reference.url}>
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {reference.label} <InterfaceIcon name="arrowUpRight" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <button type="button" className="og-article-copy" onClick={onCopy}>
          {copied ? (
            <>
              링크 복사 완료 <InterfaceIcon name="check" />
            </>
          ) : (
            <>
              이 안내 링크 복사 <InterfaceIcon name="arrowUpRight" />
            </>
          )}
        </button>
      </div>
    </article>
  );
}
