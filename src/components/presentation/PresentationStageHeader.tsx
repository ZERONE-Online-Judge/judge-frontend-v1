import type { ContestScoringMode } from '@/domains/contestAdministration/types';
import { usePresentationTitleFit } from './usePresentationTitleFit';
import './PresentationStageHeader.css';

function splitContestTitle(title: string) {
  const [primary = '스코어보드', ...rest] = title.trim().split(/\s+/);
  return { primary, secondary: rest.join(' ') };
}

/** Original presentation hero, shared with the retained result playback. */
export default function PresentationStageHeader({
  title,
  scoringMode,
  beforeStart,
  ended,
  timing,
}: {
  title: string;
  scoringMode?: ContestScoringMode;
  beforeStart: boolean;
  ended: boolean;
  timing: { label: string; time: string; value: string }[];
}) {
  const titleParts = splitContestTitle(title);
  const { frameRef, titleRef, probeRef } = usePresentationTitleFit(
    title,
    beforeStart,
  );
  return (
    <header
      className={[
        'presentation-hero presentation-stage-header relative isolate overflow-hidden rounded-[1.25rem] border border-indigo-300/10 bg-[radial-gradient(circle_at_50%_100%,rgba(59,56,255,0.42),transparent_42%),linear-gradient(115deg,#070914_0%,#11154b_54%,#0d1848_100%)] shadow-[0_1.5rem_5rem_rgba(0,0,0,0.38)]',
        beforeStart
          ? 'is-before-start px-[clamp(1.5rem,4vw,5rem)] py-[clamp(2rem,5vw,6rem)]'
          : 'px-[clamp(1rem,2vw,2rem)] py-[clamp(1rem,1.8vw,2rem)]',
      ].join(' ')}
      data-before-start={beforeStart}
      data-ended={ended}
      aria-label={
        scoringMode === 'ioi' ? '점수제 대회 스코어보드' : '대회 스코어보드'
      }
    >
      <div className="presentation-hero-decoration pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(30deg,transparent_48%,rgba(255,255,255,0.18)_49%,rgba(255,255,255,0.18)_51%,transparent_52%),linear-gradient(150deg,transparent_48%,rgba(255,255,255,0.14)_49%,rgba(255,255,255,0.14)_51%,transparent_52%)] [background-size:6.5rem_3.75rem] opacity-20" />
      <div
        className={
          beforeStart
            ? 'grid justify-items-center gap-[clamp(1rem,2vw,2rem)] text-center'
            : 'grid gap-[clamp(0.85rem,1.6vw,1.8rem)] xl:grid-cols-[minmax(18rem,1fr)_minmax(30rem,0.78fr)] xl:items-center'
        }
      >
        <div
          ref={frameRef}
          className="presentation-title-frame min-w-0"
          data-title-layout="flow"
        >
          <span
            ref={probeRef}
            className="presentation-title-fit-probe"
            aria-hidden="true"
          >
            M
          </span>
          <h1
            ref={titleRef}
            title={title.trim() || '스코어보드'}
            aria-label={title.trim() || '스코어보드'}
            className={[
              'presentation-hero-title grid gap-1 leading-[0.92] font-black tracking-normal text-white uppercase',
              beforeStart
                ? 'text-[clamp(4rem,11vw,12rem)]'
                : 'text-[clamp(2.15rem,4.8vw,5rem)]',
            ].join(' ')}
          >
            <span>{titleParts.primary}</span>
            {titleParts.secondary ? (
              <span
                className={[
                  'presentation-hero-secondary bg-gradient-to-r from-white via-violet-100 to-violet-500 bg-clip-text text-transparent',
                  beforeStart ? 'pl-0' : 'pl-[clamp(0.75rem,2.8vw,2.25rem)]',
                ].join(' ')}
              >
                {' '}
                {titleParts.secondary}
              </span>
            ) : null}
          </h1>
          <p className="sr-only">
            {beforeStart
              ? '잠시 후 대회가 시작됩니다'
              : ended
                ? '대회 종료 · 결과 공개'
                : '대회 진행 중'}
          </p>
        </div>
        <div className="grid gap-[clamp(0.65rem,1.2vw,1.2rem)] md:grid-cols-2">
          {timing.map((item) => (
            <TimePanel key={item.label} {...item} />
          ))}
        </div>
      </div>
    </header>
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
    <div className="presentation-time-panel grid min-h-[clamp(5.4rem,8vw,7.25rem)] content-center border border-white/10 bg-white/[0.07] px-[clamp(0.8rem,1.5vw,1.15rem)] py-[clamp(0.8rem,1.5vw,1.15rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <p className="presentation-time-label text-center text-[clamp(0.7rem,0.85vw,0.9rem)] font-black tracking-normal text-white/55">
        {label}
      </p>
      <p className="presentation-time-time mt-1.5 text-center text-[clamp(0.68rem,0.78vw,0.82rem)] font-bold text-white/75">
        {time}
      </p>
      <p className="presentation-time-value mt-1.5 text-center text-[clamp(1.4rem,2.65vw,2.8rem)] leading-none font-black tracking-normal text-violet-500">
        {value}
      </p>
    </div>
  );
}
