import InterfaceIcon from '@/components/common/InterfaceIcon';
import { Link } from 'react-router-dom';
import './CodingTestIntroduction.css';
import CafeReceipts from './easterEggs/CafeReceipts';

const skills = [
  [
    '문제 이해',
    '무엇을 구해야 할지, 어떤 조건을 지켜야 할지 읽고 복잡한 문제를 작은 단계로 나눠 봅니다.',
  ],
  [
    '실행 효율',
    '같은 답을 내더라도 방법에 따라 걸리는 시간과 필요한 메모리가 달라집니다. 자료가 많아져도 작동하는 방법을 고민합니다.',
  ],
  [
    '오류 확인과 수정',
    '한 번 맞는 답을 냈어도 다른 상황에서는 틀릴 수 있습니다. 여러 입력으로 확인하고, 결과를 바탕으로 풀이를 다듬습니다.',
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
              <p className="about-eyebrow">코딩 테스트</p>
              <h2 id="about-learn-heading">코딩 테스트란?</h2>
              <p>
                <strong>코딩은 컴퓨터가 할 일을 순서대로 적는 일입니다.</strong>{' '}
                사람의 생각을 컴퓨터가 이해할 수 있는 언어로 옮긴 것이
                코드입니다.
              </p>
              <p>
                코딩 테스트에서는 주어진 문제를 해결하는 코드를 작성합니다. 그
                코드가 여러 상황에서 원하는 답을 내는지, 정해진 시간과 컴퓨터의
                작업 공간(메모리) 안에서 동작하는지 확인합니다.
              </p>
              <p className="about-learn-note">
                문제를 이해하고 해결 방법을 생각한 뒤, 코드로 옮겨 확인하는
                과정을 직접 경험합니다.
              </p>
            </div>
            <CafeReceipts />
          </div>
          <div className="about-learn-why" data-reveal>
            <p className="about-eyebrow">평가 항목</p>
            <h3>코딩 테스트에서 확인하는 항목</h3>
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
            <p className="about-eyebrow">활용 분야</p>
            <div>
              <h2 id="about-purpose-heading">코딩 테스트의 활용 분야</h2>
              <p>
                코딩 테스트는 학습, 프로그래밍 대회와 일부 개발자 채용에
                사용됩니다.
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
              <p className="about-eyebrow">ZOJ의 역할</p>
              <h3>대회 운영과 자동 채점</h3>
            </div>
            <div className="about-contribution-copy">
              <p>
                대학·학회·동아리가 문제를 준비하고 대회를 열 수 있도록, 참가자
                관리부터 코드 제출·자동 채점·결과 공개까지 연결합니다.
              </p>
              <p>
                운영진은 문제의 테스트 자료와 실행 제한을 설정합니다. 제출한
                코드는 대회가 정한 테스트 자료와 시간·메모리 기준으로 채점되며,
                참가자는 결과와 제출 기록을 확인할 수 있습니다.
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
