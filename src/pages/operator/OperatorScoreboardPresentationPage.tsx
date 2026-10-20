import InterfaceIcon from '@/components/common/InterfaceIcon';
import { getPresentationScoreboard } from '@/domains/presentationAccess/api';
import { usePresentationSession } from '@/domains/presentationAccess/session';
import { isSessionAuthError } from '@/shared/api/errors';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { OperatorAccessGate } from '@/components/operator/OperatorShell';
import ScoreboardMedal from '@/components/contest/scoreboard/ScoreboardMedal';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { getOperatorPresentationScoreboard } from '@/domains/submissionScoreboard/api';
import { subscribeScoreboardUpdates } from '@/domains/submissionScoreboard/presentationSync';
import useScoreboardRowMotion from '@/domains/submissionScoreboard/useScoreboardRowMotion';
import type {
  OperatorPresentationScoreboardSection,
  ScoreboardProblemScore,
  ScoreboardRow,
} from '@/domains/submissionScoreboard/types';
import { formatDateTime } from '@/shared/lib/dateTime';
import { formatApiError } from '@/shared/api/errors';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

function timeLeftLabel(target?: string | null, now = Date.now()) {
  if (!target) return '-';

  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return '도달';

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function largeCountdownLabel(target?: string | null, now = Date.now()) {
  if (!target) return '-';

  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return '0시간 0분 0초';

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}시간 ${minutes}분 ${seconds}초`;
}

function splitContestTitle(title?: string | null) {
  const fallback = '스코어보드';
  const normalized = (title || fallback).trim();
  const [first = fallback, ...rest] = normalized.split(/\s+/);

  return {
    primary: first,
    secondary: rest.join(' '),
  };
}

function sortedProblemCodes(section: OperatorPresentationScoreboardSection) {
  const codes = new Set<string>();
  section.problems.forEach((problem) => codes.add(problem.problem_code));
  section.rows.forEach((row) => {
    row.problem_scores.forEach((score) => codes.add(score.problem_code));
  });

  return Array.from(codes).sort((a, b) =>
    a.localeCompare(b, 'ko-KR', { numeric: true }),
  );
}

function problemScoreByCode(row: ScoreboardRow) {
  return new Map(
    row.problem_scores.map((score) => [score.problem_code, score]),
  );
}

function solvedLabel(score?: ScoreboardProblemScore) {
  if (!score) return '';
  if (score.solved) {
    return score.wrong_attempts > 0 ? (
      `+${score.wrong_attempts}`
    ) : (
      <InterfaceIcon name="check" size={14} label="정답" />
    );
  }
  if (score.attempts > 0) return `-${score.attempts}`;
  return '';
}

function penaltyLabel(value?: number | null) {
  if (value === undefined || value === null) return '-';
  return value.toLocaleString('ko-KR');
}

function PresentationScoreCell({ score }: { score?: ScoreboardProblemScore }) {
  if (score?.pending_attempts && !score.solved) {
    return (
      <span
        className="inline-flex h-6 min-w-8 items-center justify-center rounded-full bg-amber-200 px-1.5 text-[0.68rem] font-black text-amber-950"
        title={`미공개 제출 ${score.pending_attempts}건`}
        aria-label={`미공개 제출 ${score.pending_attempts}건`}
      >
        ?{score.pending_attempts}
      </span>
    );
  }
  const label = solvedLabel(score);
  if (!label) {
    return <span className="text-white/20">-</span>;
  }

  return (
    <span
      className={[
        'inline-flex h-6 min-w-8 items-center justify-center rounded-full px-1.5 text-[0.68rem] font-black',
        score?.solved
          ? 'bg-emerald-300 text-slate-950'
          : 'bg-rose-300 text-slate-950 ring-1 ring-rose-100/35',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

function PresentationDivisionBoard({
  section,
}: {
  section: OperatorPresentationScoreboardSection;
}) {
  const problemCodes = useMemo(() => sortedProblemCodes(section), [section]);
  const gridMinWidth = Math.max(560, 380 + problemCodes.length * 48);
  const bodyRef = useScoreboardRowMotion(section.rows);
  const lastEvent = section.release?.resolver?.last_event;

  return (
    <section className="min-w-0 overflow-hidden rounded-[0.85rem] border border-indigo-300/15 bg-slate-950/55 p-[clamp(0.8rem,1.4vw,1.2rem)] shadow-[0_1.25rem_4rem_rgba(0,0,0,0.28)] backdrop-blur">
      <header className="flex items-end justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-black tracking-[0.28em] text-violet-300 uppercase">
            Division
          </p>
          <h2 className="truncate text-[clamp(1.35rem,2.4vw,2.45rem)] leading-none font-black tracking-normal text-white">
            {section.division.name}
          </h2>
        </div>
        <span
          className={[
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black',
            section.frozen
              ? 'border-amber-300/40 bg-amber-300/10 text-amber-100'
              : 'border-violet-300/25 bg-violet-300/10 text-violet-100',
          ].join(' ')}
        >
          <span className="size-2 rounded-full bg-current" />
          {section.release?.mode === 'all'
            ? '최종 순위'
            : section.release?.strategy === 'immediate' &&
                section.release.mode === 'partial'
              ? '프리즈 유지'
              : section.release?.mode === 'partial'
                ? '순위 공개 중'
                : section.frozen
                  ? '프리즈'
                  : '라이브'}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-left"
          style={{ minWidth: `${gridMinWidth}px` }}
        >
          <thead>
            <tr className="border-y border-white/10 text-[0.62rem] font-black tracking-normal text-white/85 uppercase">
              <th className="w-16 px-3 py-3">Rank</th>
              <th className="min-w-48 px-3 py-3">Team</th>
              <th className="w-16 px-2 py-3 text-center">Solved</th>
              {problemCodes.map((code) => (
                <th className="w-12 px-1 py-3 text-center" key={code}>
                  {code}
                </th>
              ))}
              <th className="w-20 px-3 py-3 text-center">Time</th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {section.rows.map((row) => {
              if (row.is_revealed === false)
                return (
                  <tr
                    key={row.team_id}
                    data-scoreboard-row={row.team_id}
                    className="border-b border-white/10 bg-white/[0.03]"
                  >
                    <td className="px-3 py-4 text-lg font-black text-violet-300">
                      {row.rank}
                    </td>
                    <td
                      colSpan={3 + problemCodes.length}
                      className="px-3 py-4 text-sm font-bold text-white/35"
                    >
                      공개 대기
                    </td>
                  </tr>
                );
              const scores = problemScoreByCode(row);

              return (
                <tr
                  className={`border-b border-white/5 last:border-b-0 ${lastEvent?.team_id === row.team_id ? 'bg-violet-500/25' : row.is_revealed ? 'bg-violet-500/15' : 'odd:bg-white/[0.035]'}`}
                  key={`${section.division.division_id}-${row.team_id ?? row.team_name}`}
                  data-scoreboard-row={row.team_id ?? row.team_name}
                >
                  <td className="px-3 py-2.5 text-[clamp(0.9rem,1.3vw,1.15rem)] font-black text-violet-300">
                    {row.rank}
                  </td>
                  <td className="max-w-64 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[clamp(0.8rem,1vw,0.92rem)] font-semibold text-white">
                        {row.team_name}
                      </span>
                      <ScoreboardMedal release={section.release} row={row} />
                    </span>
                    {row.is_finalized && section.release?.mode !== 'all' ? (
                      <span className="mt-0.5 block text-[0.6rem] font-medium text-emerald-300">
                        결과 공개 완료
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5 text-center text-[clamp(0.9rem,1.15vw,1.05rem)] font-black text-white/65">
                    {row.solved}
                  </td>
                  {problemCodes.map((code) => (
                    <td className="px-1 py-1.5 text-center" key={code}>
                      <PresentationScoreCell score={scores.get(code)} />
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center text-[clamp(0.9rem,1.15vw,1.05rem)] font-black text-white/65">
                    {penaltyLabel(row.penalty)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {section.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm font-bold text-white/50">
          표시할 팀이 없습니다.
        </p>
      ) : null}
    </section>
  );
}

export default function OperatorScoreboardPresentationPage() {
  const { contestId } = useParams();
  const now = useNow();

  return (
    <OperatorAccessGate
      contestId={contestId}
      permission="contest.scoreboard.view"
    >
      {(session) =>
        contestId ? (
          <OperatorScoreboardPresentationContent
            contestId={contestId}
            now={now}
            token={session.accessToken}
          />
        ) : null
      }
    </OperatorAccessGate>
  );
}

export function OperatorScoreboardPresentationContent({
  contestId,
  now,
  token,
  displayOnly = false,
}: {
  displayOnly?: boolean;
  contestId: string;
  now: number;
  token: string;
}) {
  const [searchParams] = useSearchParams();
  const queryIdentity = tokenQueryIdentity(token);
  const presentationQuery = useQuery({
    queryKey: [
      'operator',
      'scoreboard',
      'presentation',
      contestId,
      queryIdentity,
    ],
    queryFn: () =>
      displayOnly
        ? getPresentationScoreboard(contestId, token)
        : getOperatorPresentationScoreboard(contestId, token),
    retry: (count, error) => !isSessionAuthError(error) && count < 2,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  useEffect(() => {
    if (displayOnly && isSessionAuthError(presentationQuery.error)) {
      const session = usePresentationSession.getState().session;
      if (session?.access_token === token)
        usePresentationSession.getState().setSession(null);
    }
  }, [displayOnly, presentationQuery.error, token]);
  const { refetch } = presentationQuery;

  useEffect(
    () =>
      subscribeScoreboardUpdates(contestId, () => {
        void refetch();
      }),
    [contestId, refetch],
  );
  const contest = presentationQuery.data?.contest;
  const sections = presentationQuery.data?.sections ?? [];
  const selectedDivisionId = searchParams.get('divisionId') ?? '';
  const selectedSection = sections.find(
    (section) => section.division.division_id === selectedDivisionId,
  );
  const visibleSections = selectedSection ? [selectedSection] : sections;
  const titleParts = splitContestTitle(contest?.title);
  const startsAt = contest?.start_at ? new Date(contest.start_at).getTime() : 0;
  const isEnded = Boolean(
    contest &&
    (['ended', 'finalized', 'archived'].includes(contest.status ?? '') ||
      (!['draft', 'schedule_tbd'].includes(contest.status ?? '') &&
        new Date(contest.end_at).getTime() <= now)),
  );
  const isBeforeContestStart = !isEnded && Boolean(startsAt && startsAt > now);
  const shellClassName = isBeforeContestStart
    ? 'mx-auto grid min-h-[calc(100vh-clamp(1.5rem,2.8vw,2.8rem))] w-full max-w-[118rem] content-center gap-[clamp(1rem,2vw,2rem)]'
    : 'mx-auto grid w-full max-w-[118rem] gap-[clamp(0.75rem,1.3vw,1.35rem)]';

  useEffect(() => {
    if (contest?.title) {
      document.title = `${contest.title} · 프레젠테이션 스코어보드 | ZOJ`;
    }
  }, [contest?.title]);

  if (!contest && presentationQuery.isLoading) {
    return (
      <section className="fixed inset-0 z-[100] grid place-items-center bg-[#090b14] px-6 py-6 text-white">
        <div className="rounded border border-white/10 bg-white/[0.06] px-5 py-16 text-center text-lg font-black text-white/70">
          스코어보드를 불러오는 중입니다.
        </div>
      </section>
    );
  }

  if (presentationQuery.error && (!contest || displayOnly)) {
    return (
      <section className="fixed inset-0 z-[100] grid place-items-center bg-[#090b14] px-6 py-6 text-white">
        <div className="rounded border border-rose-400/40 bg-rose-500/15 px-5 py-4 text-sm font-black text-rose-100">
          {formatApiError(
            presentationQuery.error,
            '프레젠테이션 스코어보드를 불러오지 못했습니다',
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="fixed inset-0 z-[100] overflow-auto bg-[#090b14] px-[clamp(0.75rem,1.4vw,1.4rem)] py-[clamp(0.75rem,1.4vw,1.4rem)] text-white">
      <div className={shellClassName}>
        <header
          className={[
            'relative isolate overflow-hidden rounded-[1.25rem] border border-indigo-300/10 bg-[radial-gradient(circle_at_50%_100%,rgba(59,56,255,0.42),transparent_42%),linear-gradient(115deg,#070914_0%,#11154b_54%,#0d1848_100%)] shadow-[0_1.5rem_5rem_rgba(0,0,0,0.38)]',
            isBeforeContestStart
              ? 'px-[clamp(1.5rem,4vw,5rem)] py-[clamp(2rem,5vw,6rem)]'
              : 'px-[clamp(1rem,2vw,2rem)] py-[clamp(1rem,1.8vw,2rem)]',
          ].join(' ')}
        >
          <div className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(30deg,transparent_48%,rgba(255,255,255,0.18)_49%,rgba(255,255,255,0.18)_51%,transparent_52%),linear-gradient(150deg,transparent_48%,rgba(255,255,255,0.14)_49%,rgba(255,255,255,0.14)_51%,transparent_52%)] [background-size:6.5rem_3.75rem] opacity-20" />
          <div
            className={
              isBeforeContestStart
                ? 'grid justify-items-center gap-[clamp(1rem,2vw,2rem)] text-center'
                : 'grid gap-[clamp(0.85rem,1.6vw,1.8rem)] xl:grid-cols-[minmax(18rem,1fr)_minmax(30rem,0.78fr)] xl:items-center'
            }
          >
            <div className="min-w-0">
              <p
                className={[
                  'font-black text-violet-300 uppercase',
                  isBeforeContestStart
                    ? 'text-[clamp(0.8rem,1.3vw,1.2rem)] tracking-[0.34em]'
                    : 'text-[clamp(0.58rem,0.65vw,0.72rem)] tracking-[0.28em]',
                ].join(' ')}
              >
                ZOJ Presentation Scoreboard
              </p>
              <h1
                className={[
                  'grid gap-1 leading-[0.92] font-black tracking-normal text-white uppercase',
                  isBeforeContestStart
                    ? 'mt-5 text-[clamp(4rem,11vw,12rem)]'
                    : 'mt-2 text-[clamp(2.15rem,4.8vw,5rem)]',
                ].join(' ')}
              >
                <span className="zoj-truncate-safe whitespace-nowrap">
                  {titleParts.primary}
                </span>
                {titleParts.secondary ? (
                  <span
                    className={[
                      'zoj-truncate-safe bg-gradient-to-r from-white via-violet-100 to-violet-500 bg-clip-text whitespace-nowrap text-transparent',
                      isBeforeContestStart
                        ? 'pl-0'
                        : 'pl-[clamp(0.75rem,2.8vw,2.25rem)]',
                    ].join(' ')}
                  >
                    {titleParts.secondary}
                  </span>
                ) : null}
              </h1>
            </div>
            {isBeforeContestStart ? (
              <PreStartCountdown
                startAt={contest?.start_at}
                value={largeCountdownLabel(contest?.start_at, now)}
              />
            ) : (
              <div className="grid gap-[clamp(0.65rem,1.2vw,1.2rem)] md:grid-cols-2">
                <TimePanel
                  label="스코어보드 프리즈"
                  time={formatDateTime(contest?.freeze_at)}
                  value={
                    contest && new Date(contest.freeze_at).getTime() <= now
                      ? visibleSections.every((section) => !section.frozen)
                        ? '공개됨'
                        : visibleSections.some(
                              (section) =>
                                section.release?.mode === 'partial' &&
                                section.release.strategy !== 'immediate',
                            )
                          ? '결과 공개 중'
                          : '프리즈 유지'
                      : timeLeftLabel(contest?.freeze_at, now)
                  }
                />
                <TimePanel
                  label="대회 종료"
                  time={formatDateTime(contest?.end_at)}
                  value={
                    isEnded ? '대회 종료' : timeLeftLabel(contest?.end_at, now)
                  }
                />
              </div>
            )}
          </div>
        </header>

        {presentationQuery.error && contest ? (
          <div className="rounded border border-rose-400/40 bg-rose-500/15 px-5 py-4 text-sm font-black text-rose-100">
            {formatApiError(
              presentationQuery.error,
              '프레젠테이션 스코어보드를 불러오지 못했습니다',
            )}
          </div>
        ) : null}

        {presentationQuery.isLoading && !isBeforeContestStart ? (
          <div className="rounded border border-white/10 bg-white/[0.06] px-5 py-16 text-center text-lg font-black text-white/70">
            스코어보드를 불러오는 중입니다.
          </div>
        ) : null}

        {!isBeforeContestStart ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,34rem),1fr))] gap-[clamp(0.75rem,1.3vw,1.35rem)]">
            {visibleSections.map((section) => (
              <PresentationDivisionBoard
                key={section.division.division_id}
                section={section}
              />
            ))}
          </div>
        ) : null}

        {!presentationQuery.isLoading &&
        !isBeforeContestStart &&
        sections.length === 0 ? (
          <div className="rounded border border-white/10 bg-white/[0.06] px-5 py-16 text-center text-lg font-black text-white/70">
            표시할 유형이 없습니다.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PreStartCountdown({
  startAt,
  value,
}: {
  startAt?: string | null;
  value: string;
}) {
  return (
    <div className="rounded-[1rem] border border-violet-300/20 bg-violet-500/10 px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2.5vw,2.5rem)] text-center shadow-[0_1rem_3rem_rgba(0,0,0,0.2)]">
      <p className="text-[clamp(0.85rem,1.4vw,1.25rem)] font-black tracking-[0.3em] text-violet-200 uppercase">
        Contest Starts In
      </p>
      <p className="mt-3 text-[clamp(3rem,8vw,8rem)] leading-none font-black tracking-normal text-white">
        {value}
      </p>
      <p className="mt-3 text-[clamp(0.9rem,1.5vw,1.25rem)] font-bold text-white/70">
        시작 시각 {formatDateTime(startAt ?? undefined)}
      </p>
    </div>
  );
}

function TimePanel({
  label,
  time,
  value,
}: {
  label: string;
  time: string;
  value: string;
}) {
  return (
    <div className="grid min-h-[clamp(5.4rem,8vw,7.25rem)] content-center border border-white/10 bg-white/[0.07] px-[clamp(0.8rem,1.5vw,1.15rem)] py-[clamp(0.8rem,1.5vw,1.15rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <p className="text-center text-[clamp(0.7rem,0.85vw,0.9rem)] font-black tracking-normal text-white/55">
        {label}
      </p>
      <p className="mt-1.5 text-center text-[clamp(0.68rem,0.78vw,0.82rem)] font-bold text-white/75">
        {time}
      </p>
      <p className="mt-1.5 text-center text-[clamp(1.4rem,2.65vw,2.8rem)] leading-none font-black tracking-normal text-violet-500">
        {value}
      </p>
    </div>
  );
}
