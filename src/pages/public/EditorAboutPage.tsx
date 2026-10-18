import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useEffect } from 'react';
import PublicHero from '@/components/common/PublicHero';
import {
  ExperienceArrow,
  ExperienceReveal,
} from '@/components/common/PublicExperience';
import MarkdownPreview from '@/shared/ui/MarkdownPreview';
import './EditorAboutPage.css';

const statement =
  '정수 $N$개로 이루어진 수열 $A$와 기준값 $X$가 주어진다.\n\n수열의 원소 중 $X$보다 작거나 같은 원소의 개수를 구하자.';

function WindowTitle({ title }: { title: string }) {
  return (
    <div className="editor-about-window-title">
      <span className="editor-about-window-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{title}</span>
      <span className="editor-about-example">설명용 예시</span>
    </div>
  );
}

function StatementPreview() {
  return (
    <div className="editor-about-window">
      <WindowTitle title="ZOJ Editor / 기준 이하의 수" />
      <div className="editor-about-workspace">
        <div className="editor-about-sidebar" aria-hidden="true">
          <small>문제 작성</small>
          <span>개요</span>
          <span className="is-selected">지문</span>
          <span>파일 · 리소스</span>
          <span>Checker</span>
          <span>Validator</span>
          <small>테스트 · 검증</small>
          <span>테스트 · 생성 스크립트</span>
          <span>풀이</span>
          <span>실행 결과</span>
        </div>
        <div className="editor-about-statement">
          <div className="editor-about-panel-title">
            <strong>지문</strong>
            <span>한국어</span>
          </div>
          <div className="editor-about-source">
            <small>문제 지문 · LaTeX</small>
            <pre>{statement}</pre>
          </div>
          <div className="editor-about-rendered">
            <small>미리보기</small>
            <MarkdownPreview statement={statement} />
          </div>
        </div>
      </div>
    </div>
  );
}

function VerificationPreview() {
  return (
    <div className="editor-about-window">
      <WindowTitle title="실행 결과 / 풀이 검증" />
      <div className="editor-about-demo-body">
        <div className="editor-about-panel-title">
          <strong>실행 범위</strong>
          <span>tests · 선택한 풀이</span>
        </div>
        <div className="editor-about-verification-table">
          <div className="editor-about-verification-heading">
            <span>풀이</span>
            <span>기대 판정</span>
            <span>실제 판정</span>
          </div>
          {[
            ['main.cpp', '정답', '정답'],
            ['wrong.py', '오답', '오답'],
            ['slow.cpp', '시간 초과', '시간 초과'],
          ].map(([file, expected, actual]) => (
            <div className="editor-about-verification-row" key={file}>
              <strong>{file}</strong>
              <span>{expected}</span>
              <span className={actual === '정답' ? 'is-accepted' : ''}>
                {actual}
              </span>
            </div>
          ))}
        </div>
        <div className="editor-about-verification-result">
          <span aria-hidden="true">
            <InterfaceIcon name="check" />
          </span>
          <div>
            <strong>기대 판정과 일치</strong>
            <p>정답 풀이도, 틀려야 하는 풀이도 함께 확인합니다.</p>
          </div>
        </div>
        <p className="editor-about-demo-note">
          실제 작업에서는 테스트별 판정과 시간·메모리, 실행 로그를 확인합니다.
        </p>
      </div>
    </div>
  );
}

function CollaborationPreview() {
  return (
    <div className="editor-about-window">
      <WindowTitle title="리비전 / 함께 완성하는 문제" />
      <div className="editor-about-demo-body">
        <div className="editor-about-revision">
          <span className="editor-about-avatar" aria-hidden="true">
            출
          </span>
          <div>
            <strong>내 작업 사본</strong>
            <p>지문을 다듬고 경계값 테스트를 추가합니다.</p>
          </div>
          <span className="editor-about-revision-tag">작성 중</span>
        </div>
        <div className="editor-about-commit-connector" aria-hidden="true">
          <span /> 커밋으로 공유
        </div>
        <div className="editor-about-revision is-shared">
          <span className="editor-about-avatar" aria-hidden="true">
            r3
          </span>
          <div>
            <strong>경계값 테스트 보강</strong>
            <p>공유 리비전에 변경 이유와 문제 자료를 남깁니다.</p>
          </div>
        </div>
        <div className="editor-about-review-note">
          <span className="editor-about-avatar" aria-hidden="true">
            검
          </span>
          <div>
            <strong>검수 이슈</strong>
            <p>기준값과 같은 원소도 정답에 포함되는지 확인했어요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleMap() {
  return (
    <div
      className="editor-about-role-map"
      aria-label="Editor는 문제 제작, ZOJ는 대회 운영을 담당합니다"
    >
      <article>
        <span className="editor-about-role-label">대회 준비</span>
        <h3>ZOJ Editor</h3>
        <p>
          출제자와 검수자가 문제 자료를 다듬고, 대회에 사용할 기준을 확인하는
          공간
        </p>
        <div>
          <span>출제</span>
          <span>검수</span>
          <span>문제 패키지</span>
        </div>
      </article>
      <p className="editor-about-role-connector">
        <span aria-hidden="true">
          <InterfaceIcon name="arrowDown" />
        </span>{' '}
        검증한 문제를 대회로
      </p>
      <article>
        <span className="editor-about-role-label">대회 운영</span>
        <h3>ZOJ</h3>
        <p>
          참가자가 문제를 풀고, 운영자가 제출과 채점·스코어보드·결과 공개를
          관리하는 공간
        </p>
        <div>
          <span>참가</span>
          <span>채점</span>
          <span>스코어보드</span>
        </div>
      </article>
    </div>
  );
}

const comparison = [
  {
    subject: '문제 제작의 기본',
    polygon: '지문·생성기·기준 풀이·채점·입력 검증',
    editor: '지문·생성기·기준 풀이·채점·입력 검증',
  },
  {
    subject: '풀이 검증 환경',
    polygon: 'Polygon의 채점 환경',
    editor: '제작용 격리 실행 또는 ZOJ 실제 채점기 선택',
  },
  {
    subject: '완성한 문제의 전달',
    polygon: '문제 패키지 다운로드와 API',
    editor: 'ZOJ 문제 ZIP과 권한이 있는 ZOJ 대회로 직접 등록',
  },
];

export default function EditorAboutPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  return (
    <div className="public-experience editor-about-page">
      <PublicHero className="editor-about-hero">
        <div className="experience-hero-grid">
          <div className="experience-hero-copy">
            <p className="experience-eyebrow editor-about-eyebrow">
              <span className="editor-about-new">NEW</span> ZOJ EDITOR
            </p>
            <h1>
              문제 제작에서,
              <br />
              ZOJ 대회까지<span className="experience-lime">.</span>
            </h1>
            <p className="experience-lead">
              ZOJ Editor는 프로그래밍 대회 출제팀을 위한 문제 제작 플랫폼입니다.
              문제를 준비하고 검수하는 과정이, 실제 ZOJ 대회로 이어지도록
              만듭니다.
            </p>
            <a className="editor-about-entry-card" href="https://editor.zoj.kr">
              <span className="editor-about-entry-icon" aria-hidden="true">
                {'</>'}
              </span>
              <span className="editor-about-entry-copy">
                <strong>Editor 바로가기</strong>
                <span>문제 제작과 검수를 시작하세요.</span>
              </span>
              <ExperienceArrow />
            </a>
            <a className="experience-text-link" href="#editor-purpose">
              Editor가 하는 일{' '}
              <span aria-hidden="true">
                <InterfaceIcon name="arrowDown" />
              </span>
            </a>
          </div>
          <div className="editor-about-hero-preview">
            <StatementPreview />
            <p className="editor-about-preview-caption">
              대회가 시작되기 전, 출제팀의 작업 공간 · 설명용 예시
            </p>
          </div>
        </div>
      </PublicHero>

      <section
        className="experience-container experience-section"
        id="editor-purpose"
      >
        <ExperienceReveal>
          <div className="editor-about-feature">
            <div className="editor-about-feature-copy">
              <p className="experience-eyebrow">
                01 / A HOME FOR THE PROBLEM TEAM
              </p>
              <h2>
                대회가 시작되기 전,
                <br />
                출제팀이 모이는 곳.
              </h2>
              <p>
                대회에 낼 문제는 지문만으로 완성되지 않습니다. 어떤 입력을
                허용할지, 무엇을 정답으로 판단할지, 시간과 메모리 제한은
                적절한지까지 출제팀이 함께 준비해야 합니다.
              </p>
              <p>
                Editor는 그 준비를 맡습니다. 지문과 테스트, 풀이와 채점 기준을
                하나의 문제로 관리하고, 검수한 자료를 대회에 전달합니다. 참가자
                관리와 스코어보드 등 대회의 운영은 ZOJ에서 이어집니다.
              </p>
            </div>
            <RoleMap />
          </div>
          <div className="editor-about-use-cases">
            {[
              [
                '대학 · 동아리 대회',
                '여러 출제자가 준비한 문제를 한 대회의 문제 세트로 완성할 때',
              ],
              [
                '수업 · 교육용 대회',
                '학습 목표에 맞는 문제와 채점 기준을 미리 준비할 때',
              ],
              [
                '함께 출제하는 팀',
                '아이디어를 문제로 다듬고, 동료의 검수를 거쳐 보관할 때',
              ],
            ].map(([title, description]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </ExperienceReveal>
      </section>

      <section className="experience-soft-section">
        <div className="experience-container experience-section">
          <ExperienceReveal className="editor-about-feature is-reversed">
            <div className="editor-about-feature-copy">
              <p className="experience-eyebrow">
                02 / ONE PROBLEM, A SHARED REFERENCE
              </p>
              <h2>
                팀이 같은 문제를,
                <br />
                같은 기준으로.
              </h2>
              <p>
                출제자가 수정한 지문과 검수자가 확인한 테스트가 서로 다른
                버전이면, 검수를 마쳤어도 대회에 어떤 자료를 사용할지 다시
                확인해야 합니다.
              </p>
              <p>
                Editor에서는 개인의 작업 사본을 커밋해 팀과 공유합니다. 검수자는
                공유된 리비전을 기준으로 실행하고 의견을 남깁니다. 문제 자료와
                변경 이유, 실행 기록이 함께 남아 출제팀이 대회에 사용할 버전을
                판단할 수 있습니다.
              </p>
              <div className="editor-about-purpose-note">
                <strong>
                  문제를 보관하는 곳이면서, 검수의 근거가 쌓이는 곳.
                </strong>
                <p>출제와 검수가 같은 작업물을 바라보도록 연결합니다.</p>
              </div>
            </div>
            <CollaborationPreview />
          </ExperienceReveal>
        </div>
      </section>

      <section className="experience-container experience-section editor-about-comparison">
        <ExperienceReveal>
          <p className="experience-eyebrow">
            03 / FAMILIAR FOUNDATIONS, CONNECTED TO ZOJ
          </p>
          <h2>
            익숙한 제작 방식에,
            <br />
            ZOJ로 이어지는 흐름.
          </h2>
          <p className="editor-about-comparison-copy">
            Polygon처럼 지문·생성기·풀이·검증을 함께 관리하는 방식은 프로그래밍
            대회 문제 제작의 중요한 기반입니다. ZOJ Editor는 이 제작 흐름을
            바탕으로, ZOJ에서 대회를 준비하는 팀에게 필요한 연결을 더했습니다.
          </p>
          <p className="editor-about-comparison-hint">
            옆으로 넘겨 두 플랫폼의 연결 방식을 비교하세요.
          </p>
          <div
            className="editor-about-comparison-scroll"
            role="region"
            aria-label="Polygon과 ZOJ Editor 비교표"
            tabIndex={0}
          >
            <table className="editor-about-comparison-table">
              <caption className="sr-only">
                Polygon과 ZOJ Editor의 제작 흐름과 연결 방식 비교
              </caption>
              <thead>
                <tr>
                  <th scope="col">살펴볼 기준</th>
                  <th scope="col">Polygon</th>
                  <th scope="col">ZOJ Editor</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.subject}>
                    <th scope="row">{row.subject}</th>
                    <td>{row.polygon}</td>
                    <td>{row.editor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="editor-about-value-points">
            <article>
              <span>ZOJ 로그인</span>
              <p>사용하던 ZOJ 계정으로 문제 제작을 시작합니다.</p>
            </article>
            <article>
              <span>한국어 작업 안내</span>
              <p>출제·검수·배포의 흐름을 한국어 화면에서 따라갑니다.</p>
            </article>
            <article>
              <span>대회까지 이어지는 자료</span>
              <p>
                검증한 문제를 ZOJ의 참가 유형과 문제 번호에 맞춰 등록합니다.
              </p>
            </article>
          </div>
          <p className="editor-about-comparison-source">
            Polygon의 제작 흐름과 패키지·API는{' '}
            <a
              href="https://polygon.codeforces.com/"
              target="_blank"
              rel="noreferrer"
            >
              공식 소개<span className="sr-only"> (새 창)</span>
            </a>
            와{' '}
            <a
              href="https://codeforces.github.io/polygon-misc/API"
              target="_blank"
              rel="noreferrer"
            >
              API 문서<span className="sr-only"> (새 창)</span>
            </a>
            를 기준으로 설명합니다.
          </p>
        </ExperienceReveal>
      </section>

      <section className="experience-soft-section">
        <div className="experience-container experience-section">
          <ExperienceReveal className="editor-about-feature">
            <div className="editor-about-feature-copy">
              <p className="experience-eyebrow">
                04 / REVIEW WITH THE CONTEST IN MIND
              </p>
              <h2>
                문제가 쓰일 환경에서,
                <br />
                미리 확인하는 검수.
              </h2>
              <p>
                정답 풀이가 통과하는지와 함께, 틀려야 하는 풀이가 제대로
                걸러지는지도 확인해야 합니다. 제한 시간과 메모리 역시 실제
                대회의 채점 기준에 맞아야 합니다.
              </p>
              <p>
                Editor에서 ZOJ 실제 채점기를 선택하면, 풀이 검증 작업이 ZOJ 채점
                큐로 전달됩니다. 대회에 사용하는 채점 환경에서 나온 판정과
                시간·메모리를 확인하며 문제의 기준을 다듬을 수 있습니다.
              </p>
              <p className="editor-about-caution">
                실제 채점 환경에서의 검증과 출제팀의 논리 검수를 함께
                진행합니다. 등록 테스트 통과가 모든 입력에서의 정답을 보장하지는
                않습니다.
              </p>
            </div>
            <VerificationPreview />
          </ExperienceReveal>
        </div>
      </section>

      <section className="experience-container experience-section editor-about-publish">
        <ExperienceReveal>
          <p className="experience-eyebrow">
            05 / A HANDOFF THAT REACHES THE CONTEST
          </p>
          <h2>
            준비한 자료가,
            <br />
            실제 대회 문제가 되도록.
          </h2>
          <p className="editor-about-publish-copy">
            제작과 운영 사이에는 문제를 검증하고 전달하는 단계가 있습니다.
            Editor에서 공유한 리비전의 자료를 패키지로 만들고, ZOJ 대회의 문제로
            등록하는 흐름을 연결합니다.
          </p>
          <ol
            className="editor-about-publishing-flow"
            aria-label="Editor에서 ZOJ 대회로 이어지는 과정"
          >
            {[
              ['01', '작업 사본', '출제자가 문제를 준비'],
              ['02', '공유 리비전', '팀이 같은 자료를 검수'],
              ['03', '검증된 패키지', '문제와 채점 자료를 묶음'],
              ['04', 'ZOJ 대회', '운영할 대회의 문제로 등록'],
            ].map(([number, title, description]) => (
              <li key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
          <div className="editor-about-publish-options">
            <article>
              <span className="editor-about-publish-symbol" aria-hidden="true">
                <InterfaceIcon name="arrowUpRight" />
              </span>
              <h3>제작한 문제를 ZOJ 대회로</h3>
              <p>
                문제 소유자는 검증된 ZOJ 패키지를 업로드 권한이 있는 대회에 직접
                등록할 수 있습니다. 대회·참가 유형·문제 번호를 선택해 참가자가
                풀 문제로 연결합니다.
              </p>
              <span className="editor-about-pill">
                대회 운영으로 이어지는 제작
              </span>
            </article>
            <article>
              <span className="editor-about-publish-symbol" aria-hidden="true">
                ZIP
              </span>
              <h3>문제 자료를 하나의 작업물로</h3>
              <p>
                지문·테스트·풀이·채점 파일을 패키지로 보관합니다. ZOJ 문제 ZIP과
                Editor / Polygon 형식의 내보내기를 지원해, 작업 자료를 파일로
                전달하거나 다시 가져올 수 있습니다.
              </p>
              <span className="editor-about-pill">제작 자료의 보관과 전달</span>
            </article>
          </div>
        </ExperienceReveal>
      </section>

      <section className="editor-about-cta">
        <ExperienceReveal className="experience-container">
          <p className="experience-eyebrow">YOUR PROBLEM, YOUR NEXT CONTEST</p>
          <h2>
            지금 준비하는 대회,
            <br />
            문제부터 함께 시작해요.
          </h2>
          <p>
            출제와 검수는 ZOJ Editor에서. 준비한 문제는 ZOJ 대회로 이어집니다.
          </p>
          <a className="experience-button is-lime" href="https://editor.zoj.kr">
            ZOJ Editor로 이동 <ExperienceArrow />
          </a>
          <span className="editor-about-cta-wordmark" aria-hidden="true">
            PROBLEM <InterfaceIcon name="arrowRight" /> CONTEST
          </span>
        </ExperienceReveal>
      </section>
    </div>
  );
}
