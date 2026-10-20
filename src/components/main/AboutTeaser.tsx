import InterfaceIcon from '@/components/common/InterfaceIcon';
import { Link } from 'react-router-dom';

export default function AboutTeaser() {
  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-[#171c30] p-7 text-white sm:p-10 lg:p-12"
      aria-labelledby="about-teaser-heading"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-10 size-80 rounded-full border border-white/10"
      >
        <div className="absolute inset-10 rounded-full border border-white/10" />
        <div className="absolute inset-20 rounded-full border border-white/10" />
      </div>
      <div className="relative flex flex-col items-start justify-between gap-7 sm:flex-row sm:items-center">
        <div>
          <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-[#b8f28b]">
            ZERONE ONLINE JUDGE
          </p>
          <h2
            id="about-teaser-heading"
            className="text-2xl leading-snug font-bold tracking-tight sm:text-3xl"
          >
            ZOJ 소개
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            대회 운영 기능과 서비스 운영 이력을 확인합니다.
          </p>
        </div>
        <Link
          to="/about"
          className="inline-flex min-h-12 shrink-0 items-center gap-5 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-[#b8f28b]"
        >
          ZOJ 소개{' '}
          <span aria-hidden="true">
            <InterfaceIcon name="arrowUpRight" />
          </span>
        </Link>
      </div>
    </section>
  );
}
