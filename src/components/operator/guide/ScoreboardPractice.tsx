import {
  formatScore,
  IOI_SCORING_DESCRIPTION,
} from '@/domains/submissionScoreboard/scoring';
import { useMemo, useState } from 'react';
import ContestScoreboardTable from '@/components/contest/scoreboard/ContestScoreboardTable';
import ScoreboardReleaseView from '@/components/operator/ScoreboardReleaseView';
import type { ScoreboardReleaseMode } from '@/domains/contestAdministration/types';
import type {
  ScoreboardRelease,
  ScoreboardReleaseAction,
} from '@/domains/submissionScoreboard/types';
import {
  PRACTICE_DIVISION,
  PRACTICE_PROBLEMS,
  applyScoreboardPractice,
  createScoreboardPractice,
  getScoreboardPractice,
} from './scoreboardPractice';
import './ScoreboardPractice.css';

const modes: { value: ScoreboardReleaseMode; label: string; detail: string }[] =
  [
    { value: 'resolver', label: '리졸버', detail: '한 문제 공개 · 순위 이동' },
    {
      value: 'manual_all',
      label: '운영진 일괄 공개',
      detail: '종료 후 버튼으로 전체 공개',
    },
    { value: 'manual', label: '순위별 공개', detail: '선택한 최종 순위 확정' },
    {
      value: 'immediate',
      label: '종료 즉시 전체 공개',
      detail: '종료와 함께 전체 공개',
    },
  ];

function nextGuide(release: ScoreboardRelease): {
  title: string;
  detail: string;
} {
  if (release.strategy === 'manual_all') {
    return release.mode === 'all'
      ? {
          title: '운영진이 전체 성적을 공개했습니다',
          detail:
            '공개 후에는 남은 채점과 재채점 결과도 계속 반영됩니다. 되돌리기로 공개 전 프리즈 순위표로 돌아갔다가 다시 전체 공개해 보세요.',
        }
      : {
          title: '종료 후 원하는 시점에 전체 공개해 보세요',
          detail:
            '종료되어도 운영자가 전체 공개 버튼을 누를 때까지 프리즈 순위표를 유지합니다. 발표 시작이나 순위·문제별 조작 없이 한 번에 모두 공개합니다.',
        };
  }
  if (release.strategy === 'immediate') {
    return release.mode === 'all'
      ? {
          title: '종료와 동시에 전체 성적이 공개됩니다',
          detail:
            '별도 발표 시작이 필요하지 않습니다. 되돌리기를 누르면 프리즈 순위표를 유지하고, 다시 전체 공개로 돌아갈 수 있습니다.',
        }
      : {
          title: '전체 공개를 되돌린 상태입니다',
          detail:
            '프리즈 이후 성적이 다시 가려졌습니다. 다시 전체 공개를 누르면 최신 전체 성적으로 돌아갑니다.',
        };
  }
  if (release.mode === 'all') {
    return {
      title: '발표를 마쳤습니다',
      detail:
        '되돌리기로 마지막 공개를 취소해 보세요. 다른 공개 방식을 선택하거나 체험 초기화로 다시 연습할 수 있습니다.',
    };
  }
  if (release.mode === 'not_started') {
    return release.strategy === 'resolver'
      ? {
          title: '프리즈 순위에서 발표를 시작해 보세요',
          detail:
            '결과 순차 공개 시작을 누른 뒤 다음 문제 공개를 눌러 보세요. 현재 가장 아래 팀의 첫 미공개 문제를 한 번에 처리합니다.',
        }
      : {
          title: '프리즈 순위와 최종 순위를 비교해 보세요',
          detail:
            '개별 순위 공개 시작을 누른 뒤 5위를 공개해 보세요. 프리즈 때 2위였던 느린 번개가 최종 5위로 확정됩니다.',
        };
  }
  if (release.strategy === 'resolver') {
    const event = release.resolver?.last_event;
    return event
      ? {
          title: `${event.team_name} · ${event.problem_code} 공개`,
          detail:
            event.status === 'accepted'
              ? `정답과 기존 오답 페널티가 함께 반영됐습니다. ${event.from_rank === event.to_rank ? `${event.to_rank}위를 유지합니다.` : `${event.from_rank}위에서 ${event.to_rank}위로 이동했습니다.`} 다음 공개는 바뀐 순위의 가장 아래 미공개 팀부터 진행합니다.`
              : '이 문제의 미공개 제출을 모두 반영했습니다. 오답은 실패 기록에 누적되며, 컴파일 오류에는 오답 페널티가 붙지 않습니다. 되돌리기는 방금 공개한 문제 전체를 복원합니다.',
        }
      : {
          title: '다음 문제 공개를 눌러 보세요',
          detail:
            '같은 문제의 오답 → 오답 → 정답도 한 번에 반영합니다. 횟수·페널티·순위가 함께 바뀌는 모습을 확인해 보세요.',
        };
  }
  const fifth = release.ranks.find((rank) => rank.rank === 5)?.revealed;
  const fourth = release.ranks.find((rank) => rank.rank === 4)?.revealed;
  if (!fifth)
    return {
      title: '5위 공개를 눌러 보세요',
      detail:
        '발표하는 번호는 최종 순위입니다. 5위를 공개하면 확정 순위 영역에 5위로 표시되고, 미공개 팀은 프리즈 순위를 유지합니다.',
    };
  return fourth
    ? {
        title: '4위를 공개해도 5위는 그대로입니다',
        detail:
          '발표한 순위끼리는 최종 순위로 정렬됩니다. 나머지 순위도 공개하거나, 되돌리기로 직전 순위의 공개를 취소해 보세요.',
      }
    : {
        title: '5위가 확정됐습니다. 이번에는 4위를 공개해 보세요',
        detail:
          '다른 팀의 결과가 공개되어도 이미 발표한 5위는 바뀌지 않습니다. 아래 미공개 영역의 숫자는 최종 순위가 아닌 프리즈 순위입니다.',
      };
}

export default function ScoreboardPractice() {
  const [practice, setPractice] = useState(() => createScoreboardPractice());
  const [showCounts, setShowCounts] = useState(true);
  const [generation, setGeneration] = useState(0);
  const board = useMemo(
    () => getScoreboardPractice(practice, showCounts),
    [practice, showCounts],
  );
  const guide =
    practice.scoringMode === 'ioi'
      ? {
          title: board.release.resolver?.last_event
            ? `${board.release.resolver.last_event.team_name} · ${board.release.resolver.last_event.problem_code} 공개`
            : 'IOI 점수제 발표를 체험해 보세요',
          detail: board.release.resolver?.last_event
            ? `문제 점수 ${formatScore(board.release.resolver.last_event.from_score ?? 0)} → ${formatScore(board.release.resolver.last_event.to_score)}점. 그룹별 최고점과 순위를 함께 반영합니다. 동점 팀은 공동 순위입니다.`
            : IOI_SCORING_DESCRIPTION,
        }
      : nextGuide(board.release);

  function reset(strategy = practice.strategy) {
    setPractice(createScoreboardPractice(strategy, practice.scoringMode));
    setGeneration((value) => value + 1);
  }
  function publish(action: ScoreboardReleaseAction) {
    const command = {
      ...action,
      expected_revision: board.release.revision,
      ...(action.action === 'next'
        ? { expected_step: board.release.resolver?.step }
        : {}),
    };
    setPractice((previous) => applyScoreboardPractice(previous, command));
  }

  return (
    <section className="scoreboard-practice" aria-label="스코어보드 공개 체험">
      <div className="scoreboard-practice__intro">
        <div>
          <span className="scoreboard-practice__eyebrow">
            운영 전 미리 체험
          </span>
          <p>
            가상 {board.rows.length}팀 · {PRACTICE_PROBLEMS.length}문제의 발표를
            직접 진행해 보세요.
          </p>
        </div>
        <button
          className="scoreboard-practice__reset"
          type="button"
          onClick={() => reset()}
        >
          체험 초기화
        </button>
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="체험 채점 방식"
      >
        {(['icpc', 'ioi'] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            aria-pressed={(practice.scoringMode ?? 'icpc') === mode}
            className={`min-h-10 rounded-lg border px-4 py-2 text-xs font-semibold ${(practice.scoringMode ?? 'icpc') === mode ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}
            onClick={() => {
              setPractice(createScoreboardPractice(practice.strategy, mode));
              setGeneration((value) => value + 1);
            }}
          >
            {mode === 'ioi' ? 'IOI 점수제' : 'ICPC 정답 / 오답'}
          </button>
        ))}
      </div>
      <div
        className="scoreboard-practice__modes"
        role="group"
        aria-label="체험 공개 방식"
      >
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            aria-pressed={practice.strategy === mode.value}
            onClick={() => {
              if (practice.strategy !== mode.value) reset(mode.value);
            }}
          >
            <strong>{mode.label}</strong>
            <span>{mode.detail}</span>
          </button>
        ))}
      </div>
      <div
        className="scoreboard-practice__coach"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span aria-hidden="true" className="scoreboard-practice__coach-mark">
          ↳
        </span>
        <div>
          <strong>{guide.title}</strong>
          <p>{guide.detail}</p>
        </div>
      </div>
      <div className="scoreboard-practice__options">
        <label>
          <input
            type="checkbox"
            checked={showCounts}
            onChange={(event) => setShowCounts(event.target.checked)}
          />
          <span>프리즈 이후 제출 횟수 표시</span>
        </label>
        <span>횟수를 꺼도 공개 단계는 유지됩니다.</span>
      </div>
      <ScoreboardReleaseView
        scoringMode={practice.scoringMode}
        key={`${practice.strategy}:${generation}`}
        release={board.release}
        strategy={practice.strategy}
        divisionName={PRACTICE_DIVISION.name}
        publish={publish}
        practice
      />
      <div className="scoreboard-practice__board-header">
        <strong>참가자·관객에게 보이는 순위표</strong>
        <span className="scoreboard-practice__board-state">
          {board.release.mode === 'all'
            ? '최종 순위'
            : board.release.mode === 'partial'
              ? '공개 진행 중'
              : '프리즈 순위'}
        </span>
      </div>
      <ContestScoreboardTable
        scoringMode={practice.scoringMode}
        rows={board.rows}
        problems={PRACTICE_PROBLEMS}
        release={board.release}
      />
      <div className="scoreboard-practice__footnote">
        <div
          className="scoreboard-practice__legend"
          aria-label="문제 칸 표시 안내"
        >
          <span>
            <i data-tone="accepted" />
            {practice.scoringMode === 'ioi' ? '만점' : '정답'}
          </span>
          <span>
            <i data-tone="wrong" />
            {practice.scoringMode === 'ioi' ? '부분점수 · 0점' : '오답'}
          </span>
          <span>
            <i data-tone="pending" />
            ?n 미공개 제출
          </span>
        </div>
        <p>
          가상 데이터로만 연습합니다. 실제 대회의 설정이나 순위는 바뀌지
          않습니다.
        </p>
      </div>
    </section>
  );
}
