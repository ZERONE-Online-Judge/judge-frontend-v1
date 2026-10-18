import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useState } from 'react';
import { ExperienceReveal } from '@/components/common/PublicExperience';
import { judgeMemoryBenchmark as benchmark } from '@/data/judgeMemoryBenchmark';

export default function JudgeMemoryReference() {
  const [elements, setElements] = useState(1_000_000);
  const cases = benchmark.cases.filter(
    (c) => c.group === 'measurement' && c.elements === elements,
  );
  return (
    <section
      className="experience-container experience-section"
      id="judge-memory"
    >
      <ExperienceReveal>
        <div className="experience-section-heading">
          <div>
            <p className="experience-eyebrow">A FEEL FOR MEMORY</p>
            <h2>정수 100만 개, 얼마나 담을 수 있을까요?</h2>
          </div>
          <p>같은 개수도 언어와 저장 방식에 따라 달라요.</p>
        </div>
        <div
          className="judge-memory-options"
          role="group"
          aria-label="메모리 실측 원소 수"
        >
          {[
            [0, '빈 배열'],
            [1_000_000, '100만 개'],
            [10_000_000, '1000만 개'],
          ].map(([count, label]) => (
            <button
              key={count}
              type="button"
              aria-pressed={elements === count}
              onClick={() => setElements(Number(count))}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="judge-speed-reference" aria-live="polite">
          {cases.map((item, index) => (
            <article
              className={`judge-speed-card ${index < 2 ? 'is-cpp' : 'is-python'}`}
              key={item.language}
            >
              <span>{item.label}</span>
              <p>
                <strong>{(item.memoryKiB.mean / 1024).toFixed(2)}</strong>
                <span>MiB</span>
              </p>
              <small>
                평균 · 최소 {(item.memoryKiB.min / 1024).toFixed(2)} ~ 최대{' '}
                {(item.memoryKiB.max / 1024).toFixed(2)}
              </small>
              <div className="judge-memory-meter" aria-hidden="true">
                <i
                  style={{
                    width: `${Math.max(0.5, (item.memoryKiB.mean / 1024 / 512) * 100)}%`,
                  }}
                />
              </div>
            </article>
          ))}
        </div>
        <p className="judge-section-footnote">
          {benchmark.displayDate} 실측 · 조건별 5회 평균 · 막대는 측정용 제한
          512MiB 대비 사용량이에요. 선택하면 저장된 측정값이 바뀌며 새 채점은
          발생하지 않아요.
        </p>
        <div className="judge-speed-example">
          <span className="judge-small-label">크기를 가늠하는 첫 계산</span>
          <p>
            4바이트 정수 100만 개의 데이터는 <strong>약 3.81MiB</strong>예요.
            1000 × 1000 배열도 같은 원소 수예요. 여기에 배열 관리와 실행 환경의
            메모리가 더해져요. Python 리스트는 정수 객체와 참조도 필요해서{' '}
            <strong>원소 수 × 4</strong>로 계산하면 안 돼요.
          </p>
        </div>
        <details className="judge-inline-details judge-speed-evidence">
          <summary>MLE 사례와 측정 조건 보기</summary>
          <div>
            <p>
              0부터 N−1까지 저장하고 모든 원소의 합을 출력했어요. 배열 공간을
              실제로 사용했으며, 정상 측정 60회는 모두 정답입니다. 단순히 공간만
              예약한 결과가 아니에요. 빈 배열 값도 같은 프로그램을 N=0으로
              실행한 측정값이에요.
            </p>
            <div className="zoj-horizontal-scroll">
              <table className="judge-memory-table">
                <caption>제한을 낮춰 각각 3회 확인한 실제 MLE 사례</caption>
                <thead>
                  <tr>
                    <th>저장 방식</th>
                    <th>원소 수</th>
                    <th>적용 제한</th>
                    <th>결과</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmark.cases
                    .filter((c) => c.group === 'limit-probe')
                    .map((c) => (
                      <tr key={c.id}>
                        <th scope="row">{c.label}</th>
                        <td>{(c.elements / 10000).toLocaleString()}만</td>
                        <td>{c.memory_limit_mb}MiB</td>
                        <td>3회 모두 MLE</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p>
              Java 2000만 개 사례는 전체 제한 128MiB 안에서 JVM 힙 상한 64MiB를
              넘어 배열을 만들지 못했어요. 표시 메모리가 128MiB보다 작아도 MLE가
              될 수 있어요.
            </p>
            <p>
              일반 측정은 모든 언어 30초·512MiB, 한 번에 한 제출, 매번 새
              프로세스입니다. 표시는 실제 채점기의 메모리 보고값이며 다른 작업은
              관측되지 않았어요. 1MiB는 1,048,576바이트입니다. 실제 문제의
              언어별·테스트별 제한을 먼저 확인하세요.
            </p>
            <p>
              MLE라면 큰 배열·복사본·객체·누적되는 자료를 살펴보세요. 깊은
              재귀의 스택 초과나 할당 실패는 런타임 에러로 나타날 수도 있어요.
              최종 판정과 메시지를 함께 확인하세요.
            </p>
            <a
              className="experience-text-link"
              href={benchmark.snapshotPath}
              download
            >
              4개 언어 코드와 72회 측정 기록 다운로드{' '}
              <InterfaceIcon name="arrowDown" />
            </a>
          </div>
        </details>
      </ExperienceReveal>
    </section>
  );
}
