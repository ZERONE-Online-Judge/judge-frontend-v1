import Select from '@/shared/ui/Select';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useState } from 'react';
import { judgeTimeSources } from '@/data/judgeTimeSources';
import { ExperienceReveal } from '@/components/common/PublicExperience';
import {
  judgeTimeBenchmark as data,
  estimateTimeBudget,
} from '@/data/judgeTimeBenchmark';
import type { TimeComplexity } from '@/data/judgeTimeBenchmark';
import './JudgeTimeReference.css';

const seconds = (ms: number) =>
  ms > 0 && ms < 1
    ? '<0.001'
    : (ms / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 3 });
const number = (n: number) =>
  n.toLocaleString('ko-KR', { maximumFractionDigits: 0 });

export default function JudgeTimeReference() {
  const [language, setLanguage] = useState('cpp17');
  const [profileId, setProfile] = useState('memory');
  const [complexity, setComplexity] = useState<TimeComplexity>('quadratic');
  const [inputSize, setInputSize] = useState('10000');
  const [factor, setFactor] = useState('2');
  const profile = data.profiles.find((p) => p.id === profileId)!;
  const selected = data.cases.find(
    (c) => c.language === language && c.profile === profileId,
  )!;
  const evidence = judgeTimeSources[selected.id];
  const estimate = estimateTimeBudget(
    { ...selected, runtimeMs: { max: selected.serialMaxMs } },
    profileId === 'search' ? 'linear' : complexity,
    Number(inputSize),
    Number(factor),
  );
  return (
    <section
      className="experience-container experience-section"
      id="judge-performance"
    >
      <ExperienceReveal>
        <div className="experience-section-heading">
          <div>
            <p className="experience-eyebrow">A FEEL FOR SPEED</p>
            <h2>같은 1억 번도, 하는 일에 따라 달라요.</h2>
          </div>
          <p>반복문 안에서 무엇을 하는지부터 살펴봐요.</p>
        </div>
        <div className="judge-time-language">
          <label htmlFor="time-language">내 풀이 언어</label>
          <Select
            id="time-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {data.languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
          <span>2.2GHz 고정 · 단독 3회 중 최대 CPU 시간이에요.</span>
        </div>
        <div className="judge-time-profiles">
          {data.profiles.map((p) => {
            const c = data.cases.find(
              (item) => item.language === language && item.profile === p.id,
            )!;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={profileId === p.id}
                className="judge-time-profile"
                onClick={() => setProfile(p.id)}
              >
                <span>{p.label}</span>
                <small>{p.countLabel}</small>
                <span className="judge-time-comparison">
                  <span>
                    <small>단독 실행 최대</small>
                    <strong>
                      {seconds(c.serialMaxMs)}
                      <small>초</small>
                    </strong>
                  </span>
                </span>
                <span className="judge-time-description">{p.description}</span>
              </button>
            );
          })}
        </div>
        <p className="judge-section-footnote">
          {data.displayDate} · 연산 4종 × 언어 4종 · 단독 3회씩, 총 48건. 이진
          탐색은 <strong>100만 번의 탐색</strong>이에요. 다른 카드의 1억 회
          반복과 단위가 달라요.
        </p>
        <details className="judge-inline-details judge-time-source">
          <summary>선택한 작업의 코드·입력·반복 측정값 보기</summary>
          <div>
            <p>
              단독 3회:{' '}
              {evidence.serialMs.map((ms) => seconds(ms) + '초').join(' · ')}
            </p>
            {language === 'python313' && (
              <p>
                이 Python 코드는 파일 최상위의 for 반복문입니다. 표시 시간에는
                반복 제어와 선택한 작업의 본문 연산 비용이 함께 포함됩니다. 함수
                안의 반복, 내장 함수, 다른 알고리즘의 실행 시간은 이 코드와 다를
                수 있어요.
              </p>
            )}
            <span className="judge-small-label">실제로 제출한 코드</span>
            <pre>
              <code>{evidence.source}</code>
            </pre>
            <span className="judge-small-label">입력 · 반복 횟수와 시작값</span>
            <pre>{evidence.input}</pre>
            <span className="judge-small-label">검증한 기대 출력</span>
            <pre>{evidence.output}</pre>
          </div>
        </details>
        <div className="judge-time-calculator">
          <div>
            <span className="judge-small-label">
              최대 입력으로 시간 예산 잡기
            </span>
            <h3>내 반복문에는 시간이 얼마나 필요할까요?</h3>
            <p>
              선택한 작업: <strong>{profile.label}</strong>. 실제 코드의 반복문
              본문과 비슷한 작업을 골라 주세요.
            </p>
          </div>
          <div className="judge-time-fields">
            <label>
              {profileId === 'search' ? '총 탐색 호출 수' : '최대 입력 N'}
              <input
                type="number"
                min="1"
                max="1000000000"
                step="1"
                value={inputSize}
                onChange={(e) => setInputSize(e.target.value)}
              />
            </label>
            {profileId !== 'search' && (
              <label>
                반복 횟수 가정
                <Select
                  value={complexity}
                  onChange={(e) =>
                    setComplexity(e.target.value as TimeComplexity)
                  }
                >
                  <option value="linear">N · 한 번씩 순회</option>
                  <option value="n_log_n">N × ⌈log₂N⌉ · 규모 추정</option>
                  <option value="quadratic">N² · 두 겹 전체 순회</option>
                  <option value="pairs">N(N−1)/2 · 서로 다른 쌍</option>
                  <option value="cubic">N³ · 세 겹 전체 순회</option>
                </Select>
              </label>
            )}
            <label>
              여유 계수
              <Select
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
              >
                <option value="1">×1 · 여유 없음</option>
                <option value="2">×2 · 기본 계획값</option>
                <option value="3">×3 · 더 넉넉하게</option>
              </Select>
            </label>
          </div>
          {estimate ? (
            <div className="judge-time-result" role="status">
              <span>
                가정한 작업 수 <strong>{number(estimate.count)}회</strong>
              </span>
              <p>
                {number(estimate.count)} ÷ {number(selected.iterations)} ×{' '}
                {seconds(selected.serialMaxMs)}초 × {factor}
              </p>
              <strong className="judge-time-budget">
                {seconds(estimate.budgetMs)}초 <span>보수적 시간 예산</span>
              </strong>
              <p>
                {estimate.extrapolated
                  ? '측정 횟수보다 큰 작업을 비례 환산한 값이에요. '
                  : ''}
                이 값은 실측 결과나 통과 보장이 아니에요. 실제 문제의 언어별
                제한과 최대 입력 채점 결과를 함께 확인하세요.
              </p>
            </div>
          ) : (
            <p role="status">입력 크기는 1~10억 사이의 정수로 입력해 주세요.</p>
          )}
          <p className="judge-section-footnote">
            여유 계수 2는 계획을 위한 선택이며 최악 실행시간의 상한이 아니에요.
            문자열 비교·할당·입출력처럼 더 비싼 작업은 이 예산도 넘을 수 있어요.
            이진 탐색은 1,048,576개 배열의 탐색 1회 전체를 재서, log N을 다시
            곱하지 않아요.
          </p>
        </div>
        <details className="judge-inline-details judge-speed-evidence">
          <summary>
            어떤 조건에서 측정했나요? 최악의 입력은 어떻게 계산하나요?
          </summary>
          <div>
            <p>
              채점기는 Intel Xeon E5-2698 v4 서버의 VM 6대이며, CPU 클럭은
              2.2GHz 고정 정책입니다. C/C++은 GCC 14.2.0의 -O2, Python은 CPython
              3.13.16, Java는 Java 8 호환 환경입니다.
            </p>
            <p>
              각 작업·언어를 단독으로 3번 실행했습니다. 총 48개 제출이 모두
              정답이고 다른 채점 작업 유입은 없었습니다. 카드와 계산기는 단독
              실행 3회 중 최댓값을 기준으로 합니다.
            </p>
            <p>
              표에 기록된 각 실행은 새 프로세스를 사용합니다. 입력으로 반복
              횟수와 시작값을 받고, 계산 결과를 출력해 별도로 구한 기대값과
              비교했습니다. 표시값은 isolate가 기록한 CPU 시간입니다. 배열
              생성·프로그램 초기화·JVM/JIT의 CPU 사용을 포함하고, CPU 배정
              대기·sleep·격리 준비·큐 대기·컴파일·checker는 제외합니다. 실험
              제한은 모든 언어 120초·512MiB이며 대회 문제의 제한과 별개입니다.
              과거 경과 시간 기록과는 집계 기준이 달라 직접 비율로 비교하지
              않아요.
            </p>
            <p>
              <strong>최악의 입력에서는 실제 반복 횟수를 세세요.</strong>{' '}
              N=10,000일 때 전체 이중 순회는 1억 회, 서로 다른 쌍만 순회하면
              49,995,000회입니다. 비교 한 번에 길이 L의 문자열을 읽으면 문자
              처리량은 최대 L배가 됩니다. 한 실행에서 입력 묶음을 여러 개
              처리하면 각 묶음의 작업량을 더하지만, 서로 독립된 채점 테스트들의
              시간을 합쳐 TLE를 판단하지는 않습니다.
            </p>
            <p>
              관측된 최댓값은 측정한 조건 안에서의 최대일 뿐이에요. 배열 크기가
              캐시 범위를 넘거나 정렬·해시 충돌·메모리 할당·입력 구조가 달라지면
              비용도 바뀝니다. CPU 코어나 VM 대수로 단일 스레드 풀이 시간을
              나누지 마세요. 시간 제한에 가까우면 최악 입력을 실제 채점기로 여러
              번 실행하세요.
            </p>
            <a
              className="experience-text-link"
              href={data.snapshotPath}
              download
            >
              소스·입력·기대 출력·전체 실험 기록 다운로드{' '}
              <InterfaceIcon name="arrowDown" />
            </a>
          </div>
        </details>
      </ExperienceReveal>
    </section>
  );
}
