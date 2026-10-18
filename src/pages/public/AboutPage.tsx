import InterfaceIcon from '@/components/common/InterfaceIcon';
import PublicHero from '@/components/common/PublicHero';
import CodingTestIntroduction from '@/components/public/CodingTestIntroduction';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import './AboutPage.css';

const stages = [
  {
    label: '문제 준비',
    title: '좋은 문제는, 꼼꼼한 검수에서.',
    description:
      '문제와 테스트케이스, 정답·오답 코드를 한곳에. 실제로 풀어보고 검증하며 대회를 준비합니다.',
  },
  {
    label: '대회 운영',
    title: '시작부터 끝까지, 흐름이 끊기지 않게.',
    description:
      '이메일 인증부터 제출과 채점, 공지와 질문 답변까지. 참가자와 운영자가 하나의 공간에서 만납니다.',
  },
  {
    label: '결과 공개',
    title: '마지막 순간까지, 대회답게.',
    description:
      '제출 현황을 확인하고 스코어보드를 관리하세요. 순위를 공개하는 순간까지 운영 화면에서 함께합니다.',
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
        프리즈부터 순위 공개까지, 운영자가 대회의 마지막 장면을 만듭니다.
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
            <p className="experience-eyebrow">FROM ZERO TO YOUR CONTEST</p>
            <h1 id="about-heading">
              좋은 문제에서,
              <br />
              멋진 대회까지<span className="experience-lime">.</span>
            </h1>
            <p className="experience-lead">
              준비하는 사람도, 도전하는 사람도.
              <br />
              대회에 집중할 수 있도록 ZOJ가 함께합니다.
            </p>
            <div className="experience-actions">
              <Link className="experience-button is-lime" to="/contests">
                대회 둘러보기 <Arrow />
              </Link>
              <a className="experience-text-link" href="#about-coding-tests">
                코딩 테스트부터 알아보기 <span aria-hidden="true">↓</span>
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
                <strong>다음은, 당신의 대회.</strong>
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
            <p className="about-eyebrow">01 / BUILT FROM EXPERIENCE</p>
            <div>
              <h2 id="about-experience-heading">
                대회 현장에서 시작해,
                <br />
                실제로 쓰이는 플랫폼으로.
              </h2>
              <p>
                대회를 한 달 앞두고 필요해진 새로운 운영 환경.
                <br />
                ZOJ는 그 문제를 풀기 위해 태어났습니다.
              </p>
            </div>
          </div>
          <div className="about-event-banner" data-reveal>
            <div>
              <span className="about-event-badge">첫 실운영</span>
              <strong>HEPC 2026</strong>
              <span>Hanyang ERICA Programming Contest</span>
            </div>
            <p>
              2026. 05. 28 <span>·</span> 2시간의 도전
            </p>
          </div>
          <dl className="about-stats" data-reveal>
            {[
              ['30', '참가팀', '51명이 함께한 대회'],
              ['350', '코드 제출', '도전이 판정으로 이어지기까지'],
              ['15', '문제', '다양한 생각을 만나는 출발점'],
              ['728', '테스트케이스', '정답을 확인하는 꼼꼼한 기준'],
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
            <p className="about-eyebrow">02 / ONE CONNECTED EXPERIENCE</p>
            <div>
              <h2 id="about-workflow-heading">
                대회의 모든 순간을,
                <br />
                하나의 흐름으로.
              </h2>
              <p>
                여러 도구를 오가는 대신,
                <br />
                준비부터 결과 공개까지 ZOJ 안에서.
              </p>
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
                          '만들고, 풀어보고, 검증하기',
                          '참가자와 운영자를 연결하기',
                          '모든 도전을 기록하기',
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
            <p className="about-eyebrow">03 / A PLACE FOR EVERY ROLE</p>
            <h2 id="about-team-heading">
              각자의 역할에 집중해,
              <br />
              함께 만드는 대회.
            </h2>
            <p className="about-section-copy">
              출제부터 검수, 운영까지.
              <br />
              역할에 맞는 권한으로 필요한 도구를 나눕니다.
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
                ['01', '출제자', '문제와 테스트케이스를 다듬고', 'braces'],
                ['02', '검수자', '직접 풀어보며 완성도를 높이고', 'check'],
                [
                  '03',
                  '운영자',
                  '참가자와 대회의 흐름을 살피고',
                  'arrowUpRight',
                ],
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
              <span className="about-dot" /> 각자의 도구, 하나의 대회
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
              WHAT’S NEXT <span className="about-planned">준비 중</span>
            </p>
            <h2 id="about-next-heading">
              더 좋은 문제를 위한,
              <br />
              다음 가능성.
            </h2>
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
          <p className="about-eyebrow">YOUR NEXT CONTEST STARTS HERE</p>
          <h2 id="about-cta-heading">
            다음 대회,
            <br />
            ZOJ에서 시작해 보세요.
          </h2>
          <p>문제와 도전에 집중하세요. 운영의 흐름은 함께 만듭니다.</p>
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
            ZERO → ONE
          </span>
        </div>
      </section>
    </div>
  );
}
