import InterfaceIcon from '@/components/common/InterfaceIcon';
import PublicHero from '@/components/common/PublicHero';
import CodingTestIntroduction from '@/components/public/CodingTestIntroduction';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import './AboutPage.css';

const stages = [
  {
    label: '문제 준비',
    title: '문제와 테스트 검증',
    description:
      '문제 지문, 테스트케이스, 정답·오답 코드를 등록하고 채점기로 검증합니다.',
  },
  {
    label: '대회 운영',
    title: '참가자와 제출 관리',
    description:
      '참가자 등록, 코드 제출과 채점, 공지와 질문 답변을 관리합니다.',
  },
  {
    label: '결과 공개',
    title: '스코어보드와 결과 공개',
    description:
      '제출 현황, 스코어보드 프리즈, 순위 공개 시점과 방식을 설정합니다.',
  },
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h15m-6-6 6 6-6 6'} />
    </svg>
  );
}

function Check() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="m4 10 4 4 8-8" />
    </svg>
  );
}

function CodePreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`about-code ${compact ? 'is-compact' : ''}`}>
      <div className="about-demo-toolbar">
        <span>
          <i className="about-dot" /> solution.cpp
        </span>
        <span>C++17</span>
      </div>
      <div className="about-code-lines" aria-label="예시 정답 코드">
        <div>
          <em>01</em>
          <code>
            <b>#include</b> &lt;iostream&gt;
          </code>
        </div>
        <div>
          <em>02</em>
          <code>
            <b>using namespace</b> std;
          </code>
        </div>
        <div>
          <em>03</em>
          <code>&nbsp;</code>
        </div>
        <div>
          <em>04</em>
          <code>
            <b>int</b> main() {'{'}
          </code>
        </div>
        <div>
          <em>05</em>
          <code>
            {' '}
            <b>int</b> a, b;
          </code>
        </div>
        <div>
          <em>06</em>
          <code> cin &gt;&gt; a &gt;&gt; b;</code>
        </div>
        <div>
          <em>07</em>
          <code> cout &lt;&lt; a + b;</code>
        </div>
        <div>
          <em>08</em>
          <code>
            {' '}
            <b>return</b> <strong>0</strong>;
          </code>
        </div>
        <div>
          <em>09</em>
          <code>
            {'}'}
            <span className="about-caret" />
          </code>
        </div>
      </div>
      <div className="about-code-footer">
        <span>문제 A · 두 수의 합</span>
        <span className="about-success">
          <Check /> Accepted
        </span>
      </div>
    </div>
  );
}

function JudgePreview() {
  return (
    <div className="about-judge-preview">
      <div className="about-demo-toolbar">
        <span>제출부터 판정까지</span>
        <span className="about-demo-label">예시 화면</span>
      </div>
      <div
        className="about-node-track"
        aria-label="제출, 대기열, 격리된 채점 노드, 결과 순서로 처리됩니다"
      >
        {['코드 제출', '대기열', '격리 채점', '결과 확인'].map((name, i) => (
          <div
            className="about-node"
            style={{ '--step': i } as CSSProperties}
            key={name}
          >
            <div>
              <InterfaceIcon
                name={(['code', 'list', 'braces', 'check'] as const)[i]}
              />
            </div>
            <span>{name}</span>
          </div>
        ))}
      </div>
      <div className="about-judge-rows">
        {['A', 'B', 'C'].map((name, i) => (
          <div className="about-judge-row" key={name}>
            <span className="about-problem-letter">{name}</span>
            <span>테스트케이스 채점</span>
            <span className="about-meter">
              <i style={{ '--step': i } as CSSProperties} />
            </span>
            <span className="about-success">
              <Check /> 통과
            </span>
          </div>
        ))}
      </div>
      <p className="about-demo-note">
        제출 코드는 서비스 서버와 분리된 샌드박스에서 실행됩니다.
      </p>
    </div>
  );
}

function ScorePreview() {
  return (
    <div className="about-score-preview">
      <div className="about-demo-toolbar">
        <span>Scoreboard</span>
        <span className="about-demo-label">예시 화면</span>
      </div>
      <div className="about-score-head">
        <span>순위 / 팀</span>
        <span>문제별 결과</span>
        <span>해결</span>
      </div>
      {['Hello, World!', 'Zero to One', 'Next Challenge'].map((name, i) => (
        <div
          className={`about-score-row ${i === 0 ? 'is-first' : ''}`}
          key={name}
        >
          <div>
            <em>0{i + 1}</em>
            <strong>{name}</strong>
          </div>
          <div className="about-score-cells">
            {[0, 1, 2, 3].map((n) => (
              <span className={n < 4 - i ? 'is-solved' : ''} key={n}>
                <InterfaceIcon name={n < 4 - i ? 'check' : 'minus'} />
              </span>
            ))}
          </div>
          <b>{4 - i}</b>
        </div>
      ))}
      <p className="about-demo-note">
        운영자는 스코어보드 프리즈와 순위 공개를 설정할 수 있습니다.
      </p>
    </div>
  );
}

export default function AboutPage() {
  const root = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const page = root.current;
    if (!page || typeof IntersectionObserver === 'undefined') return;
    page.dataset.revealReady = 'true';
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-visible', 'true');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    page
      .querySelectorAll('[data-reveal]')
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  function selectStage(index: number, focus = false) {
    const next = (index + stages.length) % stages.length;
    setStage(next);
    if (focus) document.getElementById(`about-stage-${next}`)?.focus();
  }

  return (
    <div className="public-experience about-page" ref={root}>
      <PublicHero className="about-hero">
        <div className="experience-hero-grid">
          <div className="experience-hero-copy">
            <p className="experience-eyebrow">ZERONE ONLINE JUDGE</p>
            <h1 id="about-heading">ZOJ 소개</h1>
            <p className="experience-lead">
              ZOJ는 문제 등록, 코드 제출, 자동 채점과 스코어보드를 제공하는
              프로그래밍 대회 플랫폼입니다.
            </p>
            <div className="experience-actions">
              <Link className="experience-button is-lime" to="/contests">
                대회 둘러보기 <Arrow />
              </Link>
              <a className="experience-text-link" href="#about-coding-tests">
                코딩 테스트부터 알아보기{' '}
                <span aria-hidden="true">
                  <InterfaceIcon name="arrowDown" />
                </span>
              </a>
            </div>
          </div>
          <div
            className="about-hero-media"
            aria-label="코드와 테스트케이스를 함께 검증하는 기능 미리보기"
          >
            <div className="about-window">
              <div className="about-window-title">
                <span className="about-window-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>ZOJ / Problem workspace</span>
                <span>
                  <InterfaceIcon name="arrowUpRight" />
                </span>
              </div>
              <CodePreview compact />
              <div className="about-test-strip">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span style={{ '--step': n } as CSSProperties} key={n}>
                    <Check />
                    <small>TEST {String(n).padStart(2, '0')}</small>
                  </span>
                ))}
              </div>
            </div>
            <div className="about-floating-result">
              <span className="about-result-icon">
                <Check />
              </span>
              <div>
                <small>검증이 끝났습니다</small>
                <strong>테스트 5개 통과</strong>
              </div>
              <span className="about-result-spark" aria-hidden="true">
                <InterfaceIcon name="asterisk" />
              </span>
            </div>
            <p className="about-media-caption">
              문제 준비부터 채점까지 · 기능 미리보기
            </p>
          </div>
        </div>
      </PublicHero>

      <CodingTestIntroduction />

      <section
        className="about-experience about-section"
        id="about-experience"
        aria-labelledby="about-experience-heading"
      >
        <div className="about-container">
          <div className="about-section-heading" data-reveal>
            <p className="about-eyebrow">01 / 운영 이력</p>
            <div>
              <h2 id="about-experience-heading">운영 이력</h2>
              <p>ZOJ는 HEPC 2026에서 대회 운영과 채점에 사용됐습니다.</p>
            </div>
          </div>
          <div className="about-event-banner" data-reveal>
            <div>
              <span className="about-event-badge">첫 실운영</span>
              <strong>HEPC 2026</strong>
              <span>Hanyang ERICA Programming Contest</span>
            </div>
            <p>
              2026. 05. 28 <span>·</span> 진행 시간 2시간
            </p>
          </div>
          <dl className="about-stats" data-reveal>
            {[
              ['30', '참가팀', '참가자 51명'],
              ['350', '코드 제출', '전체 제출 건수'],
              ['15', '문제', '출제 문제 수'],
              ['728', '테스트케이스', '등록된 테스트 수'],
            ].map(([value, label, text]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {value}
                  <span>
                    {label === '참가팀'
                      ? '팀'
                      : label === '코드 제출'
                        ? '건'
                        : '개'}
                  </span>
                </dd>
                <p>{text}</p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        className="about-workflow about-section"
        id="about-workflow"
        aria-labelledby="about-workflow-heading"
      >
        <div className="about-container">
          <div className="about-section-heading" data-reveal>
            <p className="about-eyebrow">02 / 주요 기능</p>
            <div>
              <h2 id="about-workflow-heading">대회 운영 기능</h2>
              <p>문제 등록, 참가자 관리, 코드 채점, 결과 공개를 지원합니다.</p>
            </div>
          </div>
          <div className="about-workspace" data-reveal>
            <div
              className="about-stage-list"
              role="tablist"
              aria-label="대회 운영 과정"
              aria-orientation="vertical"
            >
              {stages.map((item, i) => (
                <button
                  role="tab"
                  type="button"
                  key={item.label}
                  id={`about-stage-${i}`}
                  aria-selected={stage === i}
                  aria-controls="about-stage-panel"
                  tabIndex={stage === i ? 0 : -1}
                  onClick={() => selectStage(i)}
                  onKeyDown={(event) => {
                    if (
                      [
                        'ArrowDown',
                        'ArrowRight',
                        'ArrowUp',
                        'ArrowLeft',
                        'Home',
                        'End',
                      ].includes(event.key)
                    ) {
                      event.preventDefault();
                      selectStage(
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? 2
                            : stage +
                              (['ArrowDown', 'ArrowRight'].includes(event.key)
                                ? 1
                                : -1),
                        true,
                      );
                    }
                  }}
                >
                  <span className="about-stage-number">0{i + 1}</span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>
                      {
                        [
                          '지문·테스트·검증 코드',
                          '참가자·제출·공지 관리',
                          '스코어보드·순위 공개',
                        ][i]
                      }
                    </small>
                  </span>
                  <Arrow />
                </button>
              ))}
            </div>
            <div
              className="about-stage-panel"
              id="about-stage-panel"
              role="tabpanel"
              aria-labelledby={`about-stage-${stage}`}
              tabIndex={0}
            >
              <div className="about-stage-content" key={stage}>
                <div className="about-preview-frame">
                  {stage === 0 ? (
                    <CodePreview />
                  ) : stage === 1 ? (
                    <JudgePreview />
                  ) : (
                    <ScorePreview />
                  )}
                </div>
                <h3>{stages[stage].title}</h3>
                <p>{stages[stage].description}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="about-team about-section"
        aria-labelledby="about-team-heading"
      >
        <div className="about-container about-team-grid">
          <div data-reveal>
            <p className="about-eyebrow">03 / 운영 권한</p>
            <h2 id="about-team-heading">역할별 운영 권한</h2>
            <p className="about-section-copy">
              출제·검수·운영에 필요한 기능별로 접근 권한을 설정합니다.
            </p>
            <div className="about-team-chips">
              <span>대학</span>
              <span>학회 · 동아리</span>
              <span>교육기관</span>
            </div>
          </div>
          <div className="about-role-board" data-reveal>
            {(
              [
                ['01', '출제자', '지문과 테스트케이스 작성', 'braces'],
                ['02', '검수자', '풀이와 테스트 검증', 'check'],
                ['03', '운영자', '참가자·공지·제출 관리', 'arrowUpRight'],
              ] as const
            ).map(([number, role, description, icon]) => (
              <div className="about-role-row" key={role}>
                <span className="about-role-icon" aria-hidden="true">
                  <InterfaceIcon name={icon} />
                </span>
                <div>
                  <strong>{role}</strong>
                  <p>{description}</p>
                </div>
                <span>{number}</span>
              </div>
            ))}
            <div className="about-role-bottom">
              <span className="about-dot" /> 기능별 운영 권한 설정
            </div>
          </div>
        </div>
      </section>

      <section
        className="about-next about-section"
        aria-labelledby="about-next-heading"
      >
        <div className="about-container about-next-grid" data-reveal>
          <div className="about-next-art" aria-hidden="true">
            <div />
            <div />
            <div />
            <span>
              <InterfaceIcon name="asterisk" />
            </span>
          </div>
          <div>
            <p className="about-eyebrow">
              추가 기능 <span className="about-planned">준비 중</span>
            </p>
            <h2 id="about-next-heading">검수 보조 기능</h2>
            <p className="about-section-copy">
              모호한 지문과 테스트케이스의 빈틈을 살피는 AI 검수 보조.
              <br className="about-desktop-break" />
              검수자의 판단을 돕는 방향으로 연구하고 있습니다.
            </p>
          </div>
        </div>
      </section>

      <section className="about-cta" aria-labelledby="about-cta-heading">
        <div className="about-container" data-reveal>
          <p className="about-eyebrow">대회 운영</p>
          <h2 id="about-cta-heading">대회 운영 문의</h2>
          <p>대회 개설과 운영에 관한 문의를 접수합니다.</p>
          <div className="about-actions">
            <Link
              className="about-button about-button-lime"
              to="/support/contact"
            >
              대회 운영 문의 <Arrow diagonal />
            </Link>
            <Link className="about-text-link" to="/contests">
              진행 중인 대회 보기 <Arrow />
            </Link>
          </div>
          <span className="about-cta-wordmark" aria-hidden="true">
            ZERO <InterfaceIcon name="arrowRight" /> ONE
          </span>
        </div>
      </section>
    </div>
  );
}
