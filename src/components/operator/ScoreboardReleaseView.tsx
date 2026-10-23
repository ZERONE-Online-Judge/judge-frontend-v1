import useConfirmation from '@/shared/ui/useConfirmation';
import { formatApiError } from '@/shared/api/errors';
import { submissionStatusLabel } from '@/domains/submissionScoreboard/status';
import type { ScoreboardReleaseMode } from '@/domains/contestAdministration/types';
import type {
  ScoreboardRelease,
  ScoreboardReleaseAction,
} from '@/domains/submissionScoreboard/types';
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
              : strategy === 'immediate'
                ? '전체 공개를 되돌리고 프리즈 표를 표시합니다. 다시 전체 공개할 때까지 유지됩니다.'
                : '전체 공개 직전의 공개 범위와 순위로 돌아갑니다.';
  const undoControl = (
    <button
      type="button"
      disabled={busy || !undo}
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
      title={undo ? undoDescription : '되돌릴 공개 기록이 없습니다.'}
      className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending && pendingAction === 'undo'
        ? '되돌리는 중…'
        : undo?.action === 'legacy'
          ? '공개 시작 전으로 되돌리기'
          : '되돌리기 (Undo)'}
    </button>
  );
  const errorNotice = error ? (
    <p role="alert" className="text-sm text-rose-700">
      {formatApiError(error, '순위 공개 상태를 변경하지 못했습니다.')}
    </p>
  ) : null;

  if (strategy === 'immediate') {
    return (
      <section
        className="mb-4 grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
        aria-label="자동 전체 공개 상태"
      >
        {confirmationDialog}
        <h3 className="font-semibold">
          {divisionName} ·{' '}
          {!release
            ? '불러오는 중…'
            : release.mode === 'partial'
              ? '프리즈 표 유지 중'
              : '전체 성적 공개 중'}
        </h3>
        <p className="text-sm leading-6">
          {release?.mode === 'partial'
            ? '전체 공개를 되돌렸습니다. 참가자 화면과 프레젠테이션에는 프리즈 표가 표시됩니다. 다시 전체 공개하면 최신 채점 결과가 반영됩니다.'
            : '대회 종료와 함께 프리즈가 해제되었습니다. 남은 채점과 재채점 결과는 참가자 스코어보드와 프레젠테이션에 계속 반영됩니다.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {release?.mode === 'partial' ? (
            <button
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
              className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              다시 전체 공개
            </button>
          ) : null}
          {undoControl}
        </div>
        {errorNotice}
      </section>
    );
  }
  return (
    <section className="mb-4 grid gap-4 rounded-xl border border-indigo-200 bg-white p-4 text-slate-800">
      {confirmationDialog}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{divisionName} · 종료 후 순위 공개</h3>
        <span className="text-sm font-medium text-indigo-700" role="status">
          {release?.mode === 'not_started'
            ? '발표 준비'
            : isResolver && resolver
              ? `${resolver.step} / ${resolver.total_steps}개 팀·문제 공개`
              : release
                ? `${release.revealed_count} / ${release.total_count}팀 공개`
                : '불러오는 중…'}
        </span>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        {isResolver
          ? '발표를 시작해도 팀명과 프리즈 순위표는 유지됩니다. ‘다음 문제 공개’를 누를 때마다 현재 가장 아래 팀의 첫 미공개 문제를 공개합니다. 해당 문제의 제출을 첫 정답 또는 마지막 제출까지 한 번에 반영한 뒤 순위를 갱신합니다.'
          : '공개 전 팀은 프리즈 기록을 유지합니다. 공개할 순위를 선택하면 해당 팀의 최종 성적을 반영하고, 현재 공개된 성적으로 순위를 갱신합니다.'}{' '}
        공개 시작 시 이 유형의 성적을 고정합니다. 재채점과 검수를 마친 뒤
        시작하세요.
      </p>
      <div className="flex flex-wrap gap-2">
        {release?.mode === 'not_started' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => publish({ action: 'start' })}
            className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {isResolver ? '결과 순차 공개 시작' : '개별 순위 공개 시작'}
          </button>
        ) : null}
        {isResolver && release?.mode === 'partial' ? (
          <button
            type="button"
            disabled={busy || !resolver || resolver.pending_count === 0}
            onClick={() =>
              publish({ action: 'next', expected_step: resolver?.step })
            }
            className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending && pendingAction === 'next'
              ? '공개 중…'
              : '다음 문제 공개'}
          </button>
        ) : null}
        {release && release.mode !== 'all' ? (
          <button
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
            className="rounded-lg border border-indigo-200 px-4 py-3 text-sm font-medium text-indigo-700 disabled:opacity-50"
          >
            이 유형 전체 공개
          </button>
        ) : release?.mode === 'all' ? (
          <p className="text-sm font-medium text-emerald-700">
            모든 순위를 공개했습니다.
          </p>
        ) : null}
        {undoControl}
      </div>
      {isResolver && resolver && release?.mode !== 'not_started' ? (
        <div className="grid gap-3 rounded-lg bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-600">
            <span>
              {release?.revealed_count ?? 0} / {release?.total_count ?? 0}팀
              결과 공개 완료
            </span>
            <span>남은 팀·문제 {resolver.pending_count}개</span>
          </div>
          <progress
            className="h-2 w-full accent-indigo-600"
            aria-label="팀·문제 공개 진행률"
            max={Math.max(1, resolver.total_steps)}
            value={
              release?.mode === 'all'
                ? Math.max(1, resolver.total_steps)
                : resolver.step
            }
          />
          {lastEvent ? (
            <p role="status" className="text-sm leading-6 text-slate-700">
              <strong className="font-semibold text-slate-950">
                {lastEvent.team_name}
              </strong>
              {' · '}
              {lastEvent.problem_code}번{' '}
              {submissionStatusLabel(lastEvent.status)}
              <span className="ml-2 inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                {lastEvent.from_rank === lastEvent.to_rank
                  ? `${lastEvent.to_rank}위 유지`
                  : `${lastEvent.from_rank}위 → ${lastEvent.to_rank}위`}
              </span>
            </p>
          ) : release?.mode === 'partial' ? (
            <p className="text-xs leading-5 text-slate-500">
              발표 준비가 끝났습니다. 다음 문제를 공개하면 참가자 화면과
              프레젠테이션의 순위가 함께 갱신됩니다.
            </p>
          ) : null}
        </div>
      ) : null}
      {!isResolver && release?.mode === 'partial' ? (
        <>
          <p className="text-sm font-medium">
            공개할 순위를 선택하세요. 공동 순위는 함께 공개됩니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {[...release.ranks].reverse().map((item) => (
              <button
                key={item.rank}
                type="button"
                disabled={busy || item.revealed}
                onClick={() => publish({ action: 'rank', rank: item.rank })}
                className={`rounded-lg border px-4 py-3 text-sm font-medium disabled:cursor-not-allowed ${item.revealed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 disabled:opacity-50'}`}
              >
                {item.rank}위 {item.revealed ? '공개 완료' : '공개'}
                {item.team_count > 1 ? ` · ${item.team_count}팀` : ''}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {errorNotice}
    </section>
  );
}
