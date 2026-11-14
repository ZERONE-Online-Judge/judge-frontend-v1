import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { formatScore } from '@/domains/submissionScoreboard/scoring';
import { presentationAwardGroups } from '@/domains/submissionScoreboard/presentationAwards';
import type { OperatorPresentationScoreboardSection } from '@/domains/submissionScoreboard/types';
import { useReducedMotion } from '@/shared/hooks/useAnimatedValue';
import PresentationMedal from './PresentationMedal';
import './PresentationAwardsStage.css';

type Props = {
  section: OperatorPresentationScoreboardSection;
  contestTitle: string;
  onComplete: () => void;
  reducedMotion?: boolean;
};

const confettiColors = ['#f4cf72', '#c4b5fd', '#78dfbc', '#f4adbb', '#9fc9f5'];

function CelebrationParticles() {
  return (
    <div className="presentation-awards-particles" aria-hidden="true">
      {Array.from({ length: 54 }, (_, index) => (
        <i
          className="presentation-awards-confetti"
          key={index}
          style={
            {
              '--piece-x': `${(index * 37.7) % 100}%`,
              '--piece-drift': `${((index * 31) % 180) - 90}px`,
              '--piece-delay': `${(index % 9) * 145}ms`,
              '--piece-duration': `${3_300 + (index % 7) * 240}ms`,
              '--piece-rotation': `${180 + ((index * 67) % 540)}deg`,
              '--piece-color': confettiColors[index % confettiColors.length],
            } as CSSProperties
          }
        />
      ))}
      {[0, 1, 2].map((burst) => (
        <div
          className="presentation-awards-firework"
          key={burst}
          style={{ '--burst': burst } as CSSProperties}
        >
          {Array.from({ length: 12 }, (_, ray) => (
            <i key={ray} style={{ '--ray': ray } as CSSProperties} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Show only the official published podium; never invent an omitted place. */
export default function PresentationAwardsStage({
  section,
  contestTitle,
  onComplete,
  reducedMotion,
}: Props) {
  const prefersReducedMotion = useReducedMotion();
  const reduced = reducedMotion ?? prefersReducedMotion;
  const callback = useRef(onComplete);
  const completed = useRef(false);
  const stageRef = useRef<HTMLElement>(null);
  const points = section.scoring_mode === 'ioi';
  const groups = presentationAwardGroups(section).sort(
    (a, b) => [2, 1, 3].indexOf(a.rank) - [2, 1, 3].indexOf(b.rank),
  );
  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    callback.current();
  }, []);

  useEffect(() => {
    callback.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    completed.current = false;
    const stage = stageRef.current;
    if (!stage) return;
    const startedAt = window.performance.now();
    let duration = reduced ? 3_500 : 7_600;
    let timer = 0;
    let frame = 0;
    let disposed = false;
    let manuallyScrolled = false;
    let regions: { element: HTMLElement; maximum: number }[] = [];
    const tick = (time: number) => {
      frame = 0;
      if (disposed || manuallyScrolled || completed.current) return;
      // Let every medal settle first, then leave the final names on screen.
      const progress = Math.max(
        0,
        Math.min(1, (time - startedAt - 3_000) / (duration - 4_400)),
      );
      regions.forEach(({ element, maximum }) => {
        element.scrollTop = maximum * progress;
      });
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    const measure = () => {
      if (disposed) return;
      regions = [
        ...stage.querySelectorAll<HTMLElement>(
          '.presentation-awards-teams, .presentation-awards-podium',
        ),
      ]
        .filter(
          (element) =>
            ['auto', 'scroll'].includes(
              window.getComputedStyle(element).overflowY,
            ) &&
            element.clientHeight > 0 &&
            element.scrollHeight - element.clientHeight > 2,
        )
        .map((element) => ({
          element,
          maximum: element.scrollHeight - element.clientHeight,
        }));
      const longest = Math.max(0, ...regions.map((region) => region.maximum));
      if (!reduced)
        duration = Math.min(
          16_000,
          Math.max(duration, 4_400 + (longest / 44) * 1_000),
        );
      stage.dataset.awardsDuration = String(Math.round(duration));
      window.clearTimeout(timer);
      timer = window.setTimeout(
        finish,
        Math.max(0, duration - (window.performance.now() - startedAt)),
      );
      if (!reduced && longest && !frame && !manuallyScrolled)
        frame = window.requestAnimationFrame(tick);
    };
    const manual = (event: Event) => {
      if (
        event.type === 'keydown' &&
        ![
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          ' ',
        ].includes((event as KeyboardEvent).key)
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        !target?.closest?.(
          '.presentation-awards-teams, .presentation-awards-podium',
        )
      )
        return;
      manuallyScrolled = true;
      window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish();
    };
    document.addEventListener('keydown', keydown, true);
    const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    inputs.forEach((name) =>
      stage.addEventListener(name, manual, { passive: true, capture: true }),
    );
    const resize =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    resize?.observe(stage);
    const mutations = new window.MutationObserver(measure);
    mutations.observe(stage, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    measure();
    void document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keydown, true);
      inputs.forEach((name) => stage.removeEventListener(name, manual, true));
      window.removeEventListener('resize', measure);
      resize?.disconnect();
      mutations.disconnect();
    };
  }, [section.division.division_id, reduced, finish]);

  return (
    <aside
      className="presentation-awards-stage"
      ref={stageRef}
      data-reduced-motion={reduced || undefined}
      data-awards-division={section.division.division_id}
      role="region"
      aria-label={`${section.division.name} 메달 수여`}
    >
      {!reduced ? <CelebrationParticles /> : null}
      <div className="presentation-awards-intro" aria-hidden="true">
        <span>축하합니다!</span>
        <i />
      </div>
      <header className="presentation-awards-header">
        <p className="presentation-awards-contest" title={contestTitle}>
          {contestTitle}
        </p>
        <h2>수상을 축하합니다</h2>
        <p className="presentation-awards-division">{section.division.name}</p>
      </header>
      <div
        className="presentation-awards-podium"
        data-count={groups.length}
        aria-label="공식 순위 기준 수상 팀"
      >
        {groups.map(({ rank, teams }) => (
          <section
            className="presentation-awards-place"
            data-place={rank}
            data-tied={teams.length > 1 || undefined}
            data-team-count={teams.length}
            data-many-teams={teams.length >= 4 || undefined}
            key={rank}
            aria-label={`${teams.length > 1 ? '공동 ' : ''}${rank}위`}
            style={
              {
                '--medal-delay': `${rank === 3 ? 900 : rank === 2 ? 1_500 : 2_100}ms`,
              } as CSSProperties
            }
          >
            <div className="presentation-awards-decoration">
              <PresentationMedal rank={rank} />
              <p className="presentation-awards-place-label">
                {teams.length > 1 ? '공동 ' : ''}
                {rank}위
              </p>
            </div>
            <ul
              className="presentation-awards-teams"
              tabIndex={teams.length > 1 ? 0 : undefined}
            >
              {teams.map((team) => (
                <li key={team.team_id} className="presentation-awards-team">
                  <h3>{team.team_name}</h3>
                  <p className="presentation-awards-result">
                    <strong>
                      {points
                        ? formatScore(team.total_score)
                        : formatScore(team.solved)}
                    </strong>
                    <span>{points ? '점' : '문제'}</span>
                  </p>
                  {points && team.max_score != null ? (
                    <p className="presentation-awards-detail">
                      / {formatScore(team.max_score)}점
                    </p>
                  ) : !points && team.penalty != null ? (
                    <p className="presentation-awards-detail">
                      페널티 {formatScore(team.penalty)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="presentation-awards-plinth" aria-hidden="true">
              <span>
                {rank === 1 ? 'GOLD' : rank === 2 ? 'SILVER' : 'BRONZE'}
              </span>
            </div>
          </section>
        ))}
        {!groups.length ? (
          <p className="presentation-awards-empty">함께해 주셔서 감사합니다</p>
        ) : null}
      </div>
      <footer className="presentation-awards-footer">
        <button type="button" onClick={finish}>
          순위표로 돌아가기 <kbd>Esc</kbd>
        </button>
      </footer>
    </aside>
  );
}
