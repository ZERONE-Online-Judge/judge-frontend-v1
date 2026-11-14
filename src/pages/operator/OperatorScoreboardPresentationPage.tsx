import { ContestCountdown } from '@/components/contest/ContestScheduleClock';
import { contestTimerState } from '@/domains/contestAdministration/contestTimer';
import './OperatorScoreboardPresentationPage.css';
import { getPresentationScoreboard } from '@/domains/presentationAccess/api';
import { usePresentationSession } from '@/domains/presentationAccess/session';
import { isSessionAuthError } from '@/shared/api/errors';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OperatorAccessGate } from '@/components/operator/OperatorShell';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { getOperatorPresentationScoreboard } from '@/domains/submissionScoreboard/api';
import { subscribeScoreboardUpdates } from '@/domains/submissionScoreboard/presentationSync';
import { queuedPresentationRefresh } from '@/domains/submissionScoreboard/presentationRefresh';
import { formatDateTime } from '@/shared/lib/dateTime';
import { formatApiError } from '@/shared/api/errors';
import PresentationDisplaySettings from '@/components/operator/PresentationDisplaySettings';
import { usePresentationDisplayPreferences } from '@/domains/submissionScoreboard/presentationDisplayPreferences';
import { usePresentationAnnouncements } from '@/domains/submissionScoreboard/usePresentationAnnouncements';
import { presentationFreezeCountdown } from '@/domains/submissionScoreboard/presentationAnnouncements';
import { usePresentationSound } from '@/domains/submissionScoreboard/presentationSound';
import { usePresentationReleaseMotion } from '@/domains/submissionScoreboard/usePresentationReleaseMotion';
import { presentationRevealMovedTeamIds } from '@/domains/submissionScoreboard/presentationReleaseMotion';
import PresentationDivisionBoard from '@/components/presentation/PresentationDivisionBoard';
import PresentationCenterStage from '@/components/presentation/PresentationCenterStage';
import PresentationStageHeader from '@/components/presentation/PresentationStageHeader';
import usePresentationRevealOrigin from '@/components/presentation/usePresentationRevealOrigin';
import usePresentationAutoScroll from '@/components/presentation/usePresentationAutoScroll';
import PresentationSoundPrompt from '@/components/presentation/PresentationSoundPrompt';
import PresentationAwardsStage from '@/components/presentation/PresentationAwardsStage';
import { usePresentationAwards } from '@/domains/submissionScoreboard/usePresentationAwards';
import './PresentationStagePage.css';

function useNow(intervalMs = 250) {
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

function scheduleClockTime(value?: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
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
  const [searchParams, setSearchParams] = useSearchParams();
  const displayRef = useRef<HTMLElement>(null);
  const {
    theme,
    fontScale,
    autoScrollVertical,
    autoScrollHorizontal,
    setTheme,
    setFontScale,
    setAutoScrollVertical,
    setAutoScrollHorizontal,
  } = usePresentationDisplayPreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundPromptOpen, setSoundPromptOpen] = useState(false);
  const sound = usePresentationSound();
  const divisionIds = useMemo(
    () => [...new Set(searchParams.getAll('divisionId').filter(Boolean))],
    [searchParams],
  );
  const [streamConnected, setStreamConnected] = useState(false);
  const client = useQueryClient();
  const queryIdentity = tokenQueryIdentity(token);
  const queryKey = useMemo(
    () => [
      displayOnly ? 'presentation-display' : 'operator',
      'scoreboard',
      'presentation',
      contestId,
      queryIdentity,
      divisionIds,
    ],
    [displayOnly, contestId, queryIdentity, divisionIds],
  );
  const presentationQuery = useQuery({
    queryKey,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[0] === queryKey[0] &&
      previousQuery?.queryKey[3] === contestId &&
      previousQuery?.queryKey[4] === queryIdentity
        ? previous
        : undefined,
    queryFn: () =>
      displayOnly
        ? getPresentationScoreboard(
            contestId,
            token,
            divisionIds.length ? divisionIds : undefined,
          )
        : getOperatorPresentationScoreboard(
            contestId,
            token,
            divisionIds.length ? divisionIds : undefined,
          ),
    retry: (count, error) => !isSessionAuthError(error) && count < 2,
    refetchInterval: streamConnected ? 5_000 : 1_000,
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

  useEffect(() => {
    const refresh = queuedPresentationRefresh(
      () => refetch({ cancelRefetch: false }),
      () => client.isFetching({ queryKey, exact: true }) > 0,
    );
    const unsubscribe = subscribeScoreboardUpdates(contestId, refresh.request, {
      token,
      displayOnly,
      onConnectionChange: setStreamConnected,
    });
    return () => {
      unsubscribe();
      refresh.stop();
    };
  }, [client, contestId, displayOnly, queryKey, refetch, token]);
  const contest = presentationQuery.data?.contest;
  const sections = useMemo(
    () =>
      (presentationQuery.data?.sections ?? []).map((section) => ({
        ...section,
        scoring_mode:
          section.scoring_mode ??
          presentationQuery.data?.scoring_mode ??
          contest?.scoring_mode ??
          'icpc',
      })),
    [presentationQuery.data, contest?.scoring_mode],
  );
  const visibleSections = useMemo(
    () =>
      divisionIds.length
        ? sections.filter((section) =>
            divisionIds.includes(section.division.division_id),
          )
        : sections,
    [sections, divisionIds],
  );
  const timerState = contest ? contestTimerState(contest, now, true) : null;
  const freezeCountdown = presentationFreezeCountdown(contest, now);
  const { activeAnnouncement, dismiss } = usePresentationAnnouncements({
    contest,
    now,
    onCue: sound.play,
    suppressed: Boolean(
      timerState?.showPresentationCountdown || freezeCountdown !== null,
    ),
  });
  const availableDivisions =
    presentationQuery.data?.available_divisions ??
    sections.map((section) => section.division);
  const frameProperties = {
    'data-presentation-theme': theme,
    style: { '--presentation-font-scale': fontScale } as CSSProperties,
  };
  const displaySettings = (
    <>
      <PresentationDisplaySettings
        theme={theme}
        fontScale={fontScale}
        onThemeChange={setTheme}
        onFontScaleChange={setFontScale}
        autoScrollVertical={autoScrollVertical}
        autoScrollHorizontal={autoScrollHorizontal}
        onAutoScrollVerticalChange={setAutoScrollVertical}
        onAutoScrollHorizontalChange={setAutoScrollHorizontal}
        onOpenChange={setSettingsOpen}
        availableDivisions={availableDivisions}
        selectedDivisionIds={divisionIds}
        onDivisionIdsChange={(ids) => {
          const next = new URLSearchParams(searchParams);
          next.delete('divisionId');
          ids.forEach((id) => next.append('divisionId', id));
          setSearchParams(next, { replace: true });
        }}
        soundEnabled={sound.enabled}
        soundReady={sound.enabled && sound.unlocked && sound.volume > 0}
        soundVolume={sound.volume}
        onSoundVolumeChange={sound.setVolume}
        onSoundEnabledChange={(enabled) => {
          if (enabled) void sound.enable();
          else sound.disable();
        }}
        onTestSound={() => void sound.test()}
        soundStatus={
          !sound.supported
            ? '이 브라우저는 효과음을 지원하지 않습니다.'
            : !sound.enabled
              ? '효과음이 꺼져 있습니다.'
              : sound.volume === 0
                ? '음량이 0%로 설정되어 있습니다.'
                : sound.unlocked
                  ? '효과음 사용 중'
                  : '화면을 한 번 클릭하면 효과음이 활성화됩니다.'
        }
      />
      <PresentationSoundPrompt
        key={contestId}
        contestId={contestId}
        supported={sound.supported}
        active={sound.enabled && sound.unlocked && sound.volume > 0}
        onEnable={sound.enable}
        onLater={sound.disable}
        onOpenChange={setSoundPromptOpen}
      />
    </>
  );
  const startsAt = contest?.start_at ? new Date(contest.start_at).getTime() : 0;
  const isEnded = Boolean(
    contest &&
    (['ended', 'finalized', 'archived'].includes(contest.status ?? '') ||
      (!['draft', 'schedule_tbd'].includes(contest.status ?? '') &&
        new Date(contest.end_at).getTime() <= now)),
  );
  const isBeforeContestStart = !isEnded && Boolean(startsAt && startsAt > now);
  const releaseMotion = usePresentationReleaseMotion({
    scopeKey: JSON.stringify([
      contestId,
      displayOnly,
      queryIdentity,
      divisionIds,
    ]),
    contestId,
    sections: visibleSections,
    ended: isEnded,
    updatedAt: presentationQuery.dataUpdatedAt,
    onCue: sound.play,
    suppressed: Boolean(
      timerState?.showPresentationCountdown ||
      freezeCountdown !== null ||
      activeAnnouncement ||
      presentationQuery.error,
    ),
  });
  const awards = usePresentationAwards({
    scopeKey: JSON.stringify([
      contestId,
      displayOnly,
      queryIdentity,
      divisionIds,
    ]),
    contestId,
    sections: visibleSections,
    ended: isEnded,
    updatedAt: presentationQuery.dataUpdatedAt,
    ready: Boolean(
      releaseMotion.idle &&
      !settingsOpen &&
      !soundPromptOpen &&
      !(
        timerState?.showPresentationCountdown ||
        freezeCountdown !== null ||
        activeAnnouncement
      ),
    ),
    suppressed: Boolean(presentationQuery.error),
    onCue: sound.play,
  });
  const shellClassName = `presentation-stage-shell ${isBeforeContestStart ? 'is-before-start' : ''}`;
  const rankMoving =
    releaseMotion.stage === 'highlighting' || releaseMotion.stage === 'moving';
  const movedTeamIds = useMemo(
    () =>
      releaseMotion.reveal
        ? presentationRevealMovedTeamIds(releaseMotion.reveal)
        : [],
    [releaseMotion.reveal],
  );
  usePresentationRevealOrigin(
    displayRef,
    releaseMotion.reveal,
    releaseMotion.stage,
  );
  usePresentationAutoScroll(displayRef, {
    verticalEnabled: autoScrollVertical,
    horizontalEnabled: autoScrollHorizontal,
    paused: Boolean(
      !contest ||
      isBeforeContestStart ||
      settingsOpen ||
      soundPromptOpen ||
      presentationQuery.error ||
      timerState?.showPresentationCountdown ||
      freezeCountdown !== null ||
      activeAnnouncement ||
      awards.section ||
      releaseMotion.reveal ||
      releaseMotion.stage !== 'board',
    ),
    scopeKey: JSON.stringify([contestId, queryIdentity, divisionIds]),
  });

  useEffect(() => {
    if (contest?.title) {
      document.title = `${contest.title} · 프레젠테이션 스코어보드 | ZOJ`;
    }
  }, [contest?.title]);

  if (!contest && presentationQuery.isLoading) {
    return (
      <section
        {...frameProperties}
        className="presentation-display fixed inset-0 z-[100] grid place-items-center bg-[#090b14] px-6 py-6 text-white"
      >
        {displaySettings}
        <div className="presentation-message rounded border border-white/10 bg-white/[0.06] px-5 py-16 text-center text-lg font-black text-white/70">
          스코어보드를 불러오는 중입니다.
        </div>
      </section>
    );
  }

  if (presentationQuery.error && (!contest || displayOnly)) {
    return (
      <section
        {...frameProperties}
        className="presentation-display fixed inset-0 z-[100] grid place-items-center bg-[#090b14] px-6 py-6 text-white"
      >
        {displaySettings}
        <div className="presentation-message is-error rounded border border-rose-400/40 bg-rose-500/15 px-5 py-4 text-sm font-black text-rose-100">
          {formatApiError(
            presentationQuery.error,
            '프레젠테이션 스코어보드를 불러오지 못했습니다',
          )}
        </div>
      </section>
    );
  }

  if (
    contest &&
    timerState &&
    (timerState.showPresentationCountdown || freezeCountdown !== null)
  ) {
    return (
      <section
        {...frameProperties}
        className="presentation-display presentation-countdown presentation-contest-countdown"
        aria-label={
          freezeCountdown !== null
            ? '스코어보드 프리즈 카운트다운'
            : '프레젠테이션 카운트다운'
        }
      >
        {displaySettings}
        <header>
          <p>ZOJ · PRESENTATION SCOREBOARD</p>
          <h1>{contest.title}</h1>
        </header>
        {freezeCountdown !== null ? (
          <div
            className="contest-clock-focus"
            role="timer"
            aria-live="off"
            aria-label={`스코어보드 프리즈까지 ${freezeCountdown}초`}
          >
            <p>스코어보드 프리즈까지</p>
            <strong key={freezeCountdown}>{freezeCountdown}</strong>
            <span>초 뒤에 순위표가 프리즈됩니다</span>
          </div>
        ) : (
          <ContestCountdown state={timerState} />
        )}
        <footer>한국 시간(KST) 기준</footer>
      </section>
    );
  }

  return (
    <section
      {...frameProperties}
      className="presentation-display presentation-stage-display fixed inset-0 z-[100] overflow-hidden bg-[#090b14] px-[clamp(0.75rem,1.4vw,1.4rem)] py-[clamp(0.75rem,1.4vw,1.4rem)] text-white"
      ref={displayRef}
    >
      {displaySettings}
      {activeAnnouncement ? (
        <div
          className="presentation-announcement"
          role="alert"
          aria-live="assertive"
        >
          <div className="presentation-announcement-card">
            <p className="presentation-announcement-kicker">대회 일정 안내</p>
            <div
              className="presentation-announcement-milestones"
              data-count={activeAnnouncement.milestones.length}
            >
              {activeAnnouncement.milestones.map(({ kind, minutes }) => (
                <h2
                  className="presentation-announcement-title"
                  key={kind}
                  style={
                    {
                      '--presentation-minute-digits': Math.max(
                        2,
                        String(minutes).length,
                      ),
                    } as CSSProperties
                  }
                >
                  <span className="presentation-announcement-event">
                    {kind === 'freeze' ? '스코어보드 프리즈' : '대회 종료'}
                    <span>까지</span>
                  </span>
                  <span className="presentation-announcement-time">
                    <strong>{minutes}</strong>
                    <span>분</span>
                  </span>
                  <span className="presentation-announcement-suffix">
                    남았습니다
                  </span>
                </h2>
              ))}
            </div>
            <div className="presentation-announcement-footer">
              <p className="presentation-announcement-caption">
                {contest?.title}
              </p>
              <p className="presentation-announcement-caption">
                잠시 후 순위표로 돌아갑니다.
              </p>
            </div>
            <button
              className="presentation-announcement-close"
              type="button"
              onClick={dismiss}
            >
              순위표로 돌아가기
            </button>
          </div>
        </div>
      ) : null}
      <div className={shellClassName}>
        <PresentationStageHeader
          title={contest?.title || '프레젠테이션 스코어보드'}
          scoringMode={
            contest?.scoring_mode ?? presentationQuery.data?.scoring_mode
          }
          beforeStart={isBeforeContestStart}
          ended={isEnded}
          timing={[
            {
              label: '스코어보드 프리즈',
              time: formatDateTime(contest?.freeze_at),
              value:
                contest && new Date(contest.freeze_at).getTime() <= now
                  ? scheduleClockTime(contest.freeze_at)
                  : timeLeftLabel(contest?.freeze_at, now),
            },
            {
              label: '대회 종료',
              time: formatDateTime(contest?.end_at),
              value: isEnded
                ? scheduleClockTime(contest?.end_at)
                : timeLeftLabel(contest?.end_at, now),
            },
          ]}
        />

        {presentationQuery.error && contest ? (
          <div className="presentation-message is-error rounded border border-rose-400/40 bg-rose-500/15 px-5 py-4 text-sm font-black text-rose-100">
            {formatApiError(
              presentationQuery.error,
              '프레젠테이션 스코어보드를 불러오지 못했습니다',
            )}
          </div>
        ) : null}

        {presentationQuery.isLoading && !isBeforeContestStart ? (
          <div className="presentation-message rounded border border-white/10 bg-white/[0.06] px-5 py-16 text-center text-lg font-black text-white/70">
            스코어보드를 불러오는 중입니다.
          </div>
        ) : null}

        {!isBeforeContestStart ? (
          <div
            className="presentation-stage-boards"
            data-reveal-stage={releaseMotion.stage}
            data-large-type={fontScale > 1.5}
            inert={Boolean(
              awards.section ||
              (releaseMotion.reveal &&
                (releaseMotion.stage === 'suspense' ||
                  releaseMotion.stage === 'result')),
            )}
            aria-hidden={Boolean(
              awards.section ||
              (releaseMotion.reveal &&
                (releaseMotion.stage === 'suspense' ||
                  releaseMotion.stage === 'result')),
            )}
          >
            {releaseMotion.sections.map((section) => (
              <PresentationDivisionBoard
                key={section.division.division_id}
                section={section}
                fontScale={fontScale}
                revealFocused={
                  releaseMotion.stage === 'focusing' &&
                  releaseMotion.reveal?.divisionId ===
                    section.division.division_id
                }
                focusTeamIds={
                  releaseMotion.reveal
                    ? releaseMotion.reveal.divisionId ===
                      section.division.division_id
                      ? releaseMotion.stage === 'focusing'
                        ? releaseMotion.reveal.teams
                            .map((team) => team.team_id)
                            .filter((id): id is string => Boolean(id))
                        : rankMoving
                          ? movedTeamIds
                          : []
                      : []
                    : []
                }
                rankMoving={
                  rankMoving &&
                  releaseMotion.reveal?.divisionId ===
                    section.division.division_id
                }
                activeProblemCode={
                  releaseMotion.reveal
                    ? releaseMotion.stage === 'focusing' &&
                      releaseMotion.reveal.divisionId ===
                        section.division.division_id
                      ? (releaseMotion.reveal.section.release?.resolver
                          ?.last_event?.problem_code ?? null)
                      : null
                    : null
                }
                activeTeamId={null}
                scoringMode={
                  section.scoring_mode ??
                  presentationQuery.data?.scoring_mode ??
                  contest?.scoring_mode
                }
              />
            ))}
          </div>
        ) : null}

        {!presentationQuery.isLoading &&
        !isBeforeContestStart &&
        visibleSections.length === 0 ? (
          <div className="presentation-message rounded border border-white/10 bg-white/[0.06] px-5 py-16 text-center text-lg font-black text-white/70">
            표시할 유형이 없습니다.
          </div>
        ) : null}
      </div>
      {releaseMotion.reveal &&
      (releaseMotion.stage === 'suspense' ||
        releaseMotion.stage === 'result' ||
        releaseMotion.stage === 'returning') ? (
        <PresentationCenterStage
          key={releaseMotion.reveal.key}
          reveal={releaseMotion.reveal}
          stage={releaseMotion.stage}
          contestTitle={contest?.title || '프레젠테이션 스코어보드'}
        />
      ) : null}
      {awards.section ? (
        <PresentationAwardsStage
          key={`${contestId}:${awards.section.division.division_id}`}
          section={awards.section}
          contestTitle={contest?.title || '프레젠테이션 스코어보드'}
          reducedMotion={awards.reducedMotion}
          onComplete={awards.complete}
        />
      ) : null}
    </section>
  );
}
