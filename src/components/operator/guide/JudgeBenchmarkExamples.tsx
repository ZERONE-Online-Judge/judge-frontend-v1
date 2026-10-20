import Select from '@/shared/ui/Select';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import { useState } from 'react';
import { judgeBenchmark, type JudgeBenchmarkCase } from '@/data/judgeBenchmark';

const languages: Record<string, string> = {
  cpp17: 'C++17',
  python313: 'Python 3.13',
  java8: 'Java 8 호환',
};
const number = (value: number) =>
  value.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const seconds = (ms: number) => (ms / 1000).toFixed(2);
const condition = (size: number) =>
  size === 1 ? '단독 1건' : `동시 ${size}건`;

export default function JudgeBenchmarkExamples({
  example,
  onSelect,
}: {
  example: JudgeBenchmarkCase;
  onSelect: (id: string) => void;
}) {
  const [batchSize, setBatchSize] = useState(1);
  const scenario = example.loadScenarios.find(
    (item) => item.batchSize === batchSize,
  )!;
  const accepted = scenario.statuses.accepted ?? 0;
  return (
    <section className="og-measured-example" aria-label="채점 성능 측정 기록">
      <p className="og-muted">
        이 기록은 7대·14슬롯 구성에서 측정한 결과입니다. 6대 운영 기준의 동시
        부하 측정값은 아닙니다.
      </p>
      <label className="og-benchmark-select">
        확인할 코드
        <Select
          value={example.id}
          onChange={(event) => onSelect(event.target.value)}
        >
          {judgeBenchmark.cases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} · {languages[item.language]}
            </option>
          ))}
        </Select>
      </label>
      <div className="og-load-selector">
        <span>동시에 채점 큐에 넣는 요청 수</span>
        <div
          className="og-benchmark-tabs"
          role="group"
          aria-label="동시 채점 요청 수"
        >
          {example.loadScenarios.map((item) => (
            <button
              type="button"
              key={item.batchSize}
              aria-pressed={batchSize === item.batchSize}
              onClick={() => setBatchSize(item.batchSize)}
            >
              {condition(item.batchSize)}
            </button>
          ))}
        </div>
        <p>
          {condition(batchSize)} × 3회 · 총 {scenario.sampleCount}건의 저장된
          실행 기록
        </p>
      </div>
      <div className="og-benchmark-metrics" aria-live="polite">
        <div>
          <span>코드 실행 시간 중앙값</span>
          <strong>
            {number(scenario.runtimeMs.median)}
            <small>ms</small>
          </strong>
          <p>
            P95 {number(scenario.runtimeMs.p95)}ms · 범위{' '}
            {number(scenario.runtimeMs.min)}~{number(scenario.runtimeMs.max)}ms
          </p>
        </div>
        <div>
          <span>메모리 최댓값</span>
          <strong>
            {(scenario.memoryKb.max / 1024).toFixed(2)}
            <small>MiB</small>
          </strong>
          <p>
            {number(scenario.memoryKb.min)}~{number(scenario.memoryKb.max)}KiB
          </p>
        </div>
        <div>
          <span>실제 판정</span>
          <strong>
            {accepted === scenario.sampleCount ? '모두 정답' : '결과 확인'}
            <small>
              {accepted} / {scenario.sampleCount}건
            </small>
          </strong>
          <p>제출 하나마다 테스트 1개 실행</p>
        </div>
        <div>
          <span>큐 대기 시간 중앙값</span>
          <strong>
            {seconds(scenario.queueWaitMs.median)}
            <small>초</small>
          </strong>
          <p>
            제출 생성 <InterfaceIcon name="arrowRight" /> 최초 배정 · P95{' '}
            {seconds(scenario.queueWaitMs.p95)}초
          </p>
        </div>
        <div>
          <span>각 요청의 결과 저장까지 중앙값</span>
          <strong>
            {seconds(scenario.completionMs.median)}
            <small>초</small>
          </strong>
          <p>
            대기·준비·컴파일·채점 포함 · P95{' '}
            {seconds(scenario.completionMs.p95)}초
          </p>
        </div>
        <div>
          <span>{batchSize}건 모두 완료 · 3회 중앙값</span>
          <strong>
            {seconds(scenario.batchCompletionMs.median)}
            <small>초</small>
          </strong>
          <p>
            3회 범위 {seconds(scenario.batchCompletionMs.min)}~
            {seconds(scenario.batchCompletionMs.max)}초
          </p>
        </div>
      </div>
      <section
        className="og-load-comparison"
        aria-label="동시 요청 수별 성능 비교"
      >
        <h4>같은 코드를 요청 수별로 비교</h4>
        <div
          className="og-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="부하별 측정값 비교표"
        >
          <table>
            <thead>
              <tr>
                <th>동시 요청</th>
                <th>코드 실행</th>
                <th>큐 대기</th>
                <th>각 요청 결과 저장</th>
                <th>전체 묶음 완료</th>
              </tr>
            </thead>
            <tbody>
              {example.loadScenarios.map((item) => (
                <tr
                  key={item.batchSize}
                  data-batch-size={item.batchSize}
                  className={
                    item.batchSize === batchSize
                      ? 'og-load-selected'
                      : undefined
                  }
                >
                  <th scope="row">
                    {condition(item.batchSize)}
                    <small>{item.sampleCount}건 · 3회</small>
                  </th>
                  <td>
                    {number(item.runtimeMs.median)}ms
                    <small>P95 {number(item.runtimeMs.p95)}ms</small>
                  </td>
                  <td>
                    {seconds(item.queueWaitMs.median)}초
                    <small>P95 {seconds(item.queueWaitMs.p95)}초</small>
                  </td>
                  <td>
                    {seconds(item.completionMs.median)}초
                    <small>P95 {seconds(item.completionMs.p95)}초</small>
                  </td>
                  <td>
                    {seconds(item.batchCompletionMs.median)}초
                    <small>
                      {seconds(item.batchCompletionMs.min)}~
                      {seconds(item.batchCompletionMs.max)}초
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          큰 숫자는 중앙값입니다. P95는 기록의 95%가 해당 값 이하인 지점입니다.
          전체 묶음 완료는 각 회차의 마지막 결과가 저장될 때까지의 시간입니다.
        </p>
      </section>
      <p className="og-server-takeaway">
        동시 100건은 100개 프로그램의 동시 실행을 뜻하지 않습니다.{' '}
        {judgeBenchmark.nodeCount}대·
        {judgeBenchmark.nodeCount * judgeBenchmark.slotsPerNode}개 제출 슬롯이
        작업을 나누어 가져가며, 자리가 날 때까지 나머지 요청은 큐에서
        기다립니다. 코드 실행 시간과 큐 대기 시간을 따로 비교하세요.
      </p>
      <details className="og-benchmark-records">
        <summary>선택 조건의 3회차 기록과 측정 방식</summary>
        <p>
          {judgeBenchmark.displayWindow} · {judgeBenchmark.limitsNote}
        </p>
        <div
          className="og-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="회차별 부하 실험 기록"
        >
          <table>
            <thead>
              <tr>
                <th>회차</th>
                <th>정답 / 요청</th>
                <th>실행 중앙값</th>
                <th>큐 대기 중앙값</th>
                <th>전체 완료</th>
                <th>사용 채점기</th>
              </tr>
            </thead>
            <tbody>
              {scenario.rounds.map((round) => (
                <tr key={round.round}>
                  <th scope="row">{round.round}회</th>
                  <td>
                    {round.statuses.accepted ?? 0} / {round.sampleCount}
                  </td>
                  <td>{number(round.runtimeMs.median)}ms</td>
                  <td>{seconds(round.queueWaitMs.median)}초</td>
                  <td>{seconds(round.batchCompletionMs)}초</td>
                  <td>
                    {Object.keys(round.nodeCounts)
                      .map((node) => `${node.slice(-2)}번`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{judgeBenchmark.method}</p>
        <p>
          실험은 같은 예제의 동시 채점 요청을 비교합니다. 측정 중 다른 제출의
          대기·실행 작업은 {judgeBenchmark.otherJudgeJobs}건입니다. 실행 결과는
          이 소스·입력·제한·실험 부하에서의 기록이며, 실제 대회는 테스트 수와
          코드 구성에 따라 달라집니다. 위 버튼은 저장된 기록을 전환하며 새
          채점을 요청하지 않습니다.
        </p>
      </details>
      <div className="og-benchmark-code">
        <div>
          <strong>실행한 코드</strong>
          <span>{languages[example.language]}</span>
        </div>
        <pre tabIndex={0} aria-label="실행한 소스 코드">
          <code>{example.source}</code>
        </pre>
      </div>
      <div className="og-benchmark-io">
        <div>
          <span>입력</span>
          <pre>{example.input || '(입력 없음)'}</pre>
        </div>
        <div>
          <span>기대 출력</span>
          <pre>{example.output}</pre>
        </div>
      </div>
      <p className="og-server-takeaway">{example.note}</p>
      <div className="og-benchmark-downloads">
        <a
          className="og-benchmark-download"
          href={judgeBenchmark.snapshotPath}
          download
        >
          예제 8종 · 소스와 측정 요약 다운로드{' '}
          <InterfaceIcon name="arrowDown" />
        </a>
        <a
          className="og-benchmark-download"
          href={judgeBenchmark.loadSamplesPath}
          download
        >
          {judgeBenchmark.measurementCount.toLocaleString()}건 전체 실행 기록
          다운로드 <InterfaceIcon name="arrowDown" />
        </a>
      </div>
    </section>
  );
}
