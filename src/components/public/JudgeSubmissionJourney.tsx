import { useEffect, useState } from 'react';
import { ExperienceReveal } from '@/components/common/PublicExperience';
import { PageHeading } from '@/components/common/PageLayout';
import ContestSubmissionsTable from '@/components/contest/submissions/ContestSubmissionsTable';
import { submissionStatusLabel } from '@/domains/submissionScoreboard/status';
import type { Submission } from '@/domains/submissionScoreboard/types';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import '@/components/contest/ContestWorkspace.css';

const stages = ['waiting', 'preparing', 'judging', 'accepted'] as const;
const source = `#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << '\\n';
    return 0;
}`;
const stageDurations = [2400, 2400, 3600, 4800] as const;
const descriptions = [
  [
    '제출 접수',
    '빈 실행 자리가 생기면 채점기가 작업을 가져갑니다. 아직 실행 전이라 시간과 메모리는 -로 표시됩니다.',
  ],
  [
    '채점 준비',
    '테스트 자료와 실행 파일을 준비합니다. C++처럼 컴파일이 필요한 언어는 이 단계에서 컴파일합니다.',
  ],
  [
    '채점 실행',
    '결과 칸에 ‘채점 중’이 표시됩니다. 이 화면에서는 테스트별 진행 상황 대신 최종 판정이 나올 때까지 확인할 수 있습니다.',
  ],
  [
    '판정 완료',
    '채점이 끝나면 결과 칸에 최종 판정이 표시되고, 시간과 메모리도 함께 확인할 수 있습니다.',
  ],
];

export default function JudgeSubmissionJourney() {
  const [{ step, submittedAt }, setScene] = useState(() => ({
    step: 0,
    submittedAt: new Date().toISOString(),
  }));
  const isVisible = useDocumentVisibility();
  const finished = step === stages.length - 1;
  const status = stages[step];

  useEffect(() => {
    if (!isVisible) return;
    const timer = window.setTimeout(() => {
      setScene((current) => {
        const next = (current.step + 1) % stages.length;
        return {
          step: next,
          submittedAt:
            next === 0 ? new Date().toISOString() : current.submittedAt,
        };
      });
    }, stageDurations[step]);
    return () => window.clearTimeout(timer);
  }, [step, isVisible]);

  const submission: Submission = {
    submission_id: 'a1b2c3d4-demo',
    problem_id: 'sum-example',
    problem_code: 'A',
    problem_title: 'A. 두 수의 합',
    team_name: '예시 참가팀',
    language: 'cpp17',
    source_code: source,
    submitted_at: submittedAt,
    status,
    // Match the participant view with progress hidden; never inject operator diagnostics.
    runtime_ms: finished ? 17 : null,
    memory_kb: finished ? 584 : null,
  };
  submission.code_length_bytes = new TextEncoder().encode(
    submission.source_code,
  ).length;

  return (
    <section className="experience-soft-section" id="judge-journey">
      <div className="experience-container experience-section">
        <ExperienceReveal>
          <div className="experience-section-heading">
            <div>
              <p className="experience-eyebrow">채점 과정</p>
              <h2>제출 상태 변경 예시</h2>
            </div>
            <p>
              참가자의 채점현황이 자동으로 바뀌는 모습을 살펴보세요.
              <br />
              언어를 누르면 제출 코드를 확인할 수 있습니다.
            </p>
          </div>
          <ol className="judge-flow-steps" aria-label="채점 과정 예시 단계">
            {stages.map((stage, index) => (
              <li
                key={stage}
                aria-current={index === step ? 'step' : undefined}
                className={index <= step ? 'is-reached' : ''}
              >
                <span>0{index + 1}</span>
                {index === 3 ? '결과 도착' : submissionStatusLabel(stage)}
              </li>
            ))}
          </ol>
          <div
            className="judge-journey-screen zoj-participant"
            aria-label="참가자 채점현황 예시"
          >
            <div className="judge-journey-screen-heading">
              <PageHeading
                level={2}
                title="채점현황"
                variant="contest"
                description="대회 중에는 로그인한 참가팀의 제출만 확인합니다."
              />
              <span className="judge-small-label">참가자 화면 · 예시</span>
            </div>
            <ContestSubmissionsTable
              preview
              contestId="journey-example"
              submissions={[submission]}
            />
            <p className="judge-journey-code-hint">
              C++17을 눌러 제출 코드를 확인해 보세요.
            </p>
          </div>
          <div className="judge-journey-explanation">
            <span aria-hidden="true">0{step + 1}</span>
            <div>
              <h3>{descriptions[step][0]}</h3>
              <p>{descriptions[step][1]}</p>
            </div>
          </div>
          <p className="judge-section-footnote">
            참가자 화면의 자동 반복 예시입니다. 코드와 수치는 설명용이며 실제
            제출은 생성하지 않습니다. 대기·채점 시간은 제출마다 다릅니다.
          </p>
        </ExperienceReveal>
      </div>
    </section>
  );
}
