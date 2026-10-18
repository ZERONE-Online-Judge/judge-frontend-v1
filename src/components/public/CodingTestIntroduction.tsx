import InterfaceIcon from '@/components/common/InterfaceIcon';
import { Link } from 'react-router-dom';
import './CodingTestIntroduction.css';

const skills = [
  [
    '문제를 이해하는 힘',
    '무엇을 구해야 할지, 어떤 조건을 지켜야 할지 읽고 복잡한 문제를 작은 단계로 나눠 봅니다.',
  ],
  [
    '효율적인 방법을 찾는 힘',
    '같은 답을 내더라도 방법에 따라 걸리는 시간과 필요한 메모리가 달라집니다. 자료가 많아져도 작동하는 방법을 고민합니다.',
  ],
  [
    '확인하고 고치는 힘',
    '한 번 맞는 답을 냈어도 다른 상황에서는 틀릴 수 있어요. 여러 입력으로 확인하고, 결과를 바탕으로 풀이를 다듬습니다.',
  ],
];
const uses = [
  [
    'LEARNING',
    '수업과 학습',
    '배운 내용을 직접 적용해 보는 연습입니다. 자신의 풀이를 제출하고 결과를 확인하며 어떤 부분을 더 공부할지 찾아갑니다.',
  ],
  [
    'CHALLENGE',
    '프로그래밍 대회',
    '정해진 시간 안에 여러 문제에 도전합니다. 어떤 문제부터 풀지 전략을 세우고, 아이디어를 실제로 동작하는 프로그램으로 완성합니다.',
  ],
  [
    'ASSESSMENT',
    '일부 개발자 채용',
    '지원자가 문제를 이해하고 코드로 구현하는 과정을 살펴보는 평가의 한 부분으로 사용됩니다. 협업·설계 등과 함께 개발 역량을 알아보는 한 가지 방법입니다.',
  ],
];

export default function CodingTestIntroduction() {
  return (
    <>
      <section
        className="about-learn about-section"
        id="about-coding-tests"
        aria-labelledby="about-learn-heading"
      >
        <div className="about-container">
          <div className="about-learn-grid">
            <div className="about-learn-copy" data-reveal>
              <p className="about-eyebrow">START WITH THE IDEA</p>
              <h2 id="about-learn-heading">
                코딩 테스트는,
                <br />
                문제를 푸는 방법을
                <br /> 확인하는 일이에요.
              </h2>
              <p>
                <strong>코딩은 컴퓨터가 할 일을 순서대로 적는 일입니다.</strong>{' '}
                사람의 생각을 컴퓨터가 이해할 수 있는 언어로 옮긴 것이 코드예요.
              </p>
              <p>
                코딩 테스트에서는 주어진 문제를 해결하는 코드를 작성합니다. 그
                코드가 여러 상황에서 원하는 답을 내는지, 정해진 시간과 컴퓨터의
                작업 공간(메모리) 안에서 동작하는지 확인해요.
              </p>
              <p className="about-learn-note">
                문제를 이해하고 해결 방법을 생각한 뒤, 코드로 옮겨 확인하는
                과정을 직접 경험하는 거예요.
              </p>
            </div>
            <article
              className="about-everyday"
              aria-labelledby="about-everyday-heading"
              data-reveal
            >
              <div className="about-everyday-heading">
                <span className="about-everyday-symbol" aria-hidden="true">
                  <InterfaceIcon name="coffee" />
                </span>
                <span>생활 속 문제로 생각해 보면</span>
              </div>
              <h3 id="about-everyday-heading">
                카페에서 가장 많이 팔린 메뉴는?
              </h3>
              <p>주문 내역을 보고, 가장 많이 나온 메뉴를 찾아보세요.</p>
              <div className="about-order-list" aria-label="주문 내역 예시">
                {['라테', '아메리카노', '라테', '레모네이드', '라테'].map(
                  (menu, index) => (
                    <span key={index}>{menu}</span>
                  ),
                )}
              </div>
              <ol className="about-everyday-steps">
                <li>
                  <span aria-hidden="true">01</span>
                  <div>
                    <strong>메뉴별 주문 수를 세고</strong>
                    <p>라테 3잔 · 아메리카노 1잔 · 레모네이드 1잔</p>
                  </div>
                </li>
                <li>
                  <span aria-hidden="true">02</span>
                  <div>
                    <strong>가장 큰 수를 찾아요</strong>
                    <p>컴퓨터에도 이 순서를 알려주는 거예요.</p>
                  </div>
                </li>
              </ol>
              <div className="about-everyday-answer">
                <span>이 주문 내역의 답</span>
                <strong>
                  라테 <small>3잔</small>
                </strong>
              </div>
              <p className="about-everyday-footnote">
                주문이 한 건이거나 아주 많아져도 잘 작동할까요? 코딩 테스트는
                이런 다양한 상황까지 확인합니다.
              </p>
            </article>
          </div>
          <div className="about-learn-why" data-reveal>
            <p className="about-eyebrow">WHY WE TRY</p>
            <h3>답을 찾는 동안, 이런 힘을 길러요.</h3>
            <div className="about-skill-grid">
              {skills.map(([title, description], index) => (
                <article key={title}>
                  <span className="about-skill-index">0{index + 1}</span>
                  <h4>{title}</h4>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="about-purpose about-section"
        aria-labelledby="about-purpose-heading"
      >
        <div className="about-container">
          <div className="about-section-heading" data-reveal>
            <p className="about-eyebrow">FROM PRACTICE TO POSSIBILITY</p>
            <div>
              <h2 id="about-purpose-heading">
                배우는 순간에도,
                <br />
                도전하는 순간에도.
              </h2>
              <p>
                코딩 테스트는 쓰이는 곳에 따라
                <br className="about-desktop-break" /> 연습이 되기도, 도전과
                평가가 되기도 합니다.
              </p>
            </div>
          </div>
          <div className="about-use-grid">
            {uses.map(([label, title, description]) => (
              <article key={title} data-reveal>
                <span className="about-eyebrow">{label}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <div className="about-contribution" data-reveal>
            <div>
              <p className="about-eyebrow">WHERE ZOJ COMES IN</p>
              <h3>ZOJ는 배움과 도전의 무대를 만듭니다.</h3>
            </div>
            <div className="about-contribution-copy">
              <p>
                대학·학회·동아리가 문제를 준비하고 대회를 열 수 있도록, 참가자
                관리부터 코드 제출·자동 채점·결과 공개까지 연결합니다.
              </p>
              <p>
                운영진은 문제와 대회 운영에, 참가자는 풀이에 집중할 수 있어요.
                제출한 코드는 대회가 정한 테스트 자료와 시간·메모리 기준으로
                채점되며, 그 결과와 기록은 다음 도전의 출발점이 됩니다.
              </p>
              <div className="about-contribution-links">
                <Link to="/contests">
                  ZOJ에서 열리는 대회 보기{' '}
                  <span aria-hidden="true">
                    <InterfaceIcon name="arrowRight" />
                  </span>
                </Link>
                <Link to="/editor">
                  문제를 만드는 ZOJ Editor 알아보기{' '}
                  <span aria-hidden="true">
                    <InterfaceIcon name="arrowUpRight" />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
