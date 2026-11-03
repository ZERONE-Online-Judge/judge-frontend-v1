import useConfirmation from '@/shared/ui/useConfirmation';
import { formatApiError } from '@/shared/api/errors';
import { submissionStatusLabel } from '@/domains/submissionScoreboard/status';
import type { ScoreboardReleaseMode } from '@/domains/contestAdministration/types';
import type {
  ScoreboardRelease,
  ScoreboardReleaseAction,
} from '@/domains/submissionScoreboard/types';
import './ScoreboardReleaseView.css';

export default function ScoreboardReleaseView({
  release,
  strategy = 'manual',
  divisionName,
  pending = false,
  pendingAction,
  error,
  publish,
}: {
  release?: ScoreboardRelease;
  strategy?: ScoreboardReleaseMode;
  divisionName: string;
  pending?: boolean;
  pendingAction?: string;
  error?: unknown;
  publish: (action: ScoreboardReleaseAction) => void;
}) {
  const { confirm: confirmAction, dialog: confirmationDialog } =
    useConfirmation();
  const busy = pending || !release;
  const resolver = release?.resolver;
  const isResolver = (release?.strategy ?? strategy) === 'resolver';
  const immediate = strategy === 'immediate';
  const complete = release?.mode === 'all';
  const preparing = release?.mode === 'not_started';
  const active = release?.mode === 'partial';
  const lastEvent = resolver?.last_event;
  const undo = release?.undo;
  const undoDescription =
    undo?.action === 'automatic'
      ? '자동 전체 공개를 되돌리고 프리즈 표를 표시합니다. 다시 전체 공개할 때까지 유지됩니다.'
      : undo?.action === 'legacy'
        ? '기존 공개에는 단계별 기록이 없어 모든 공개를 취소하고 공개 시작 전으로 돌아갑니다.'
        : undo?.action === 'start'
          ? '순위 공개 시작을 취소하고 발표 시작 전 스코어보드로 돌아갑니다.'
          : undo?.action === 'rank'
            ? `${undo.rank}위 공개를 취소하고 해당 팀의 프리즈 기록으로 복원합니다. 공동 순위도 함께 되돌립니다.`
            : undo?.action === 'next'
              ? '직전에 공개한 팀·문제의 제출 전체를 되돌리고 점수와 순위를 복원합니다.'
              : immediate
                ? '전체 공개를 되돌리고 프리즈 표를 표시합니다. 다시 전체 공개할 때까지 유지됩니다.'
                : '전체 공개 직전의 공개 범위와 순위로 돌아갑니다.';
  const status = !release
    ? '불러오는 중'
    : immediate
      ? active
        ? '프리즈 표 유지 중'
        : '전체 성적 공개 중'
      : complete
        ? '공개 완료'
        : preparing
          ? '발표 준비'
          : '공개 진행 중';

  return (
    <section
      className="scoreboard-release"
      data-state={complete ? 'complete' : preparing ? 'ready' : 'active'}
      aria-label={
        immediate ? '자동 전체 공개 상태' : `${divisionName} 순위 공개 제어`
      }
      aria-busy={pending}
    >
      {confirmationDialog}
      <header className="scoreboard-release__header">
        <h3>
          <span className="scoreboard-release__division">{divisionName}</span>
          <span>
            {immediate
              ? '종료 즉시 전체 공개'
              : isResolver
                ? '결과 순차 공개'
                : '순위별 공개'}
          </span>
        </h3>
        <span className="scoreboard-release__status" role="status">
          <span aria-hidden="true" />
          {status}
        </span>
      </header>

      {!release ? (
        <p className="scoreboard-release__description">
          공개 상태를 확인하고 있습니다.
        </p>
      ) : immediate ? (
        <p className="scoreboard-release__description">
          {active
            ? '전체 공개를 되돌렸습니다. 다시 공개할 때까지 참가자·발표 화면에 프리즈 표를 유지합니다.'
            : '프리즈가 해제되었습니다. 남은 채점과 재채점 결과도 계속 반영됩니다.'}
        </p>
      ) : preparing ? (
        <>
          <p className="scoreboard-release__description">
            {isResolver
              ? '현재 가장 아래 팀부터, 한 팀의 한 문제씩 공개합니다.'
              : '선택한 팀의 최종 순위를 확정해 공개합니다.'}
          </p>
          <details className="scoreboard-release__guide">
            <summary>시작 전 확인사항</summary>
            <p>
              공개 시작 시 이 유형의 성적을 고정합니다. 재채점과 검수를 마친 뒤
              시작하세요. 발표를 시작해도 팀명과 프리즈 기록은 유지됩니다.
            </p>
            {isResolver ? (
              <p>
                한 번의 공개로 해당 문제의 제출을 첫 정답 또는 마지막 제출까지
                반영하고 순위를 갱신합니다.
              </p>
            ) : (
              <p>
                공동 순위의 팀은 함께 공개됩니다. 발표한 순위는 고정되며, 미공개
                팀은 별도의 프리즈 순위 영역에 표시됩니다.
              </p>
            )}
          </details>
        </>
      ) : null}

      {isResolver && !immediate && resolver && active ? (
        <div className="scoreboard-release__progress">
          <div className="scoreboard-release__progress-labels">
            <p>
              <strong>
                {resolver.step}
                <span> / {resolver.total_steps}</span>
              </strong>
              <span>팀·문제 공개</span>
            </p>
            <span>남은 팀·문제 {resolver.pending_count}개</span>
          </div>
          <progress
            aria-label="팀·문제 공개 진행률"
            max={Math.max(1, resolver.total_steps)}
            value={resolver.step}
          />
          {lastEvent ? (
            <div className="scoreboard-release__event" role="status">
              <p>
                <strong>{lastEvent.team_name}</strong>
                <span> · {lastEvent.problem_code}번</span>
                <span className="scoreboard-release__verdict">
                  {submissionStatusLabel(lastEvent.status)}
                </span>
              </p>
              <span className="scoreboard-release__rank">
                {lastEvent.from_rank === lastEvent.to_rank
                  ? `${lastEvent.to_rank}위 유지`
                  : `${lastEvent.from_rank}위 → ${lastEvent.to_rank}위`}
              </span>
            </div>
          ) : (
            <p className="scoreboard-release__description">
              다음 문제를 공개하면 참가자·발표 화면의 순위가 함께 갱신됩니다.
            </p>
          )}
        </div>
      ) : null}

      {!isResolver && !immediate && active ? (
        <div className="scoreboard-release__ranks">
          <p className="scoreboard-release__team-progress">
            <strong>
              {release.revealed_count} / {release.total_count}팀
            </strong>{' '}
            공개 완료
          </p>
          <p className="scoreboard-release__description">
            최종 순위를 선택하세요. 공개한 순위는 이후에도 유지됩니다.
          </p>
          <div>
            {[...(release?.ranks ?? [])].reverse().map((item) => (
              <button
                key={item.rank}
                type="button"
                disabled={busy || item.revealed}
                data-revealed={item.revealed}
                onClick={() => publish({ action: 'rank', rank: item.rank })}
              >
                {item.rank}위 {item.revealed ? '공개 완료' : '공개'}
                {item.team_count > 1 ? ` · ${item.team_count}팀` : ''}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <footer className="scoreboard-release__footer">
        <div className="scoreboard-release__primary-actions">
          {complete ? (
            <p className="scoreboard-release__complete-summary">
              <strong>
                {release.revealed_count} / {release.total_count}팀
              </strong>
              <span>결과 공개 완료</span>
              {isResolver && resolver ? (
                <span className="scoreboard-release__problem-total">
                  팀·문제 {resolver.total_steps}개
                </span>
              ) : null}
            </p>
          ) : immediate ? (
            active ? (
              <button
                className="scoreboard-release__button scoreboard-release__button--primary"
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirmAction(
                      '프리즈를 해제하고 최신 성적을 참가자 스코어보드와 프레젠테이션에 모두 공개할까요?',
                      {
                        title: '다시 전체 공개',
                        confirmLabel: '공개',
                        tone: 'primary',
                      },
                    )
                  )
                    publish({ action: 'all' });
                }}
              >
                다시 전체 공개
              </button>
            ) : null
          ) : (
            <>
              {preparing ? (
                <button
                  className="scoreboard-release__button scoreboard-release__button--primary"
                  type="button"
                  disabled={busy}
                  onClick={() => publish({ action: 'start' })}
                >
                  {pending && pendingAction === 'start'
                    ? '시작하는 중…'
                    : isResolver
                      ? '결과 순차 공개 시작'
                      : '개별 순위 공개 시작'}
                </button>
              ) : null}
              {isResolver && active ? (
                <button
                  className="scoreboard-release__button scoreboard-release__button--primary"
                  type="button"
                  disabled={busy || !resolver || resolver.pending_count === 0}
                  onClick={() =>
                    publish({ action: 'next', expected_step: resolver?.step })
                  }
                >
                  {pending && pendingAction === 'next'
                    ? '공개 중…'
                    : '다음 문제 공개'}
                </button>
              ) : null}
              {release && !complete ? (
                <button
                  className="scoreboard-release__button"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirmAction(
                        `${divisionName}의 남은 ${isResolver ? '결과와 순위를' : '순위를'} 모두 공개할까요? 되돌리기를 누르면 현재 공개 상태로 돌아옵니다.`,
                        {
                          title: '순위 공개 확인',
                          confirmLabel: '공개',
                          tone: 'primary',
                        },
                      )
                    )
                      publish({ action: 'all' });
                  }}
                >
                  이 유형 전체 공개
                </button>
              ) : null}
            </>
          )}
        </div>
        <button
          className="scoreboard-release__undo"
          type="button"
          disabled={busy || !undo}
          title={undo ? undoDescription : '되돌릴 공개 기록이 없습니다.'}
          onClick={async () => {
            if (
              undo &&
              (await confirmAction(
                `${undoDescription} 참가자 스코어보드와 프레젠테이션에 함께 반영됩니다.`,
                {
                  title: `${divisionName} · 공개 되돌리기`,
                  confirmLabel: '되돌리기',
                  tone: 'danger',
                },
              ))
            )
              publish({ action: 'undo' });
          }}
        >
          <svg
            aria-hidden="true"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14" />
          </svg>
          {pending && pendingAction === 'undo'
            ? '되돌리는 중…'
            : undo?.action === 'legacy'
              ? '공개 시작 전으로 되돌리기'
              : '되돌리기'}
        </button>
      </footer>
      {error ? (
        <p className="scoreboard-release__error" role="alert">
          {formatApiError(error, '순위 공개 상태를 변경하지 못했습니다.')}
        </p>
      ) : null}
    </section>
  );
}
