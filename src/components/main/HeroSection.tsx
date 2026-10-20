import { useEffect, useState } from 'react';
import type { HeroContent } from '@/data/testContent';

type HeroSectionProps = HeroContent;

export default function HeroSection({
  imageSrc,
  imageAlt,
  headline,
  description,
}: HeroSectionProps) {
  const typedDescription = useTypingText(description);
  const isTyping = typedDescription.length < description.length;
  const displayDescription = typedDescription;

  return (
    <section className="relative min-h-[26rem] w-full overflow-hidden sm:min-h-[30rem] lg:min-h-[38rem]">
      <img
        alt={imageAlt}
        className="animate-hero-image absolute inset-0 h-full w-full scale-[1.03] object-cover"
        src={imageSrc}
      />
      <div className="absolute inset-0 bg-black/35" />
      <div className="animate-hero-image-light absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.12)_34%,rgba(123,97,255,0.16)_48%,transparent_68%)]" />

      <div className="absolute inset-0 z-10 mx-auto flex w-full max-w-7xl flex-col items-center justify-center px-4 text-center sm:px-6">
        <HeroTitle headline={headline} />
        <p
          aria-label={description}
          className="text-hero-copy animate-hero-copy mt-6 min-h-16 max-w-[42rem] text-sm leading-7 font-semibold break-keep sm:mt-10 sm:min-h-20 sm:text-xl sm:leading-snug lg:max-w-5xl xl:text-[1.55rem]"
        >
          <span aria-hidden="true">{displayDescription}</span>
          <span
            aria-hidden="true"
            className={[
              'ml-1 inline-block h-[1em] w-0.5 translate-y-0.5 bg-white/85',
              isTyping
                ? 'animate-typing-caret'
                : 'animate-typing-caret opacity-60',
            ].join(' ')}
          />
        </p>
      </div>
    </section>
  );
}

function HeroTitle({ headline }: { headline: string }) {
  if (headline !== 'ZERONE ONLINE JUDGE') {
    return (
      <h1 className="animate-hero-title text-[clamp(1.75rem,8vw,4.5rem)] leading-tight font-semibold text-white lg:text-7xl">
        {headline}
      </h1>
    );
  }

  return (
    <h1
      aria-label={headline}
      className="animate-hero-title relative h-[1em] w-full max-w-full overflow-visible text-[clamp(1.45rem,7vw,4.5rem)] leading-none font-semibold text-white lg:text-7xl"
    >
      <span
        aria-hidden="true"
        className="hero-zoj-title absolute inset-0 flex items-center justify-center"
      >
        <span className="hero-zoj-word hero-zoj-word-left">
          <span className="hero-zoj-letter">Z</span>
          <span className="hero-zoj-extra">ERONE</span>
        </span>
        <span className="hero-zoj-gap"> </span>
        <span className="hero-zoj-word">
          <span className="hero-zoj-letter">O</span>
          <span className="hero-zoj-extra">NLINE</span>
        </span>
        <span className="hero-zoj-gap"> </span>
        <span className="hero-zoj-word hero-zoj-word-right">
          <span className="hero-zoj-letter">J</span>
          <span className="hero-zoj-extra">UDGE</span>
        </span>
      </span>
    </h1>
  );
}

function useTypingText(text: string) {
  const [value, setValue] = useState(() =>
    prefersReducedMotion() ? text : '',
  );

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let index = 0;
    let typingTimer: number | undefined;
    const startTimer = window.setTimeout(() => {
      typingTimer = window.setInterval(() => {
        index += 1;
        setValue(text.slice(0, index));
        if (index >= text.length) {
          window.clearInterval(typingTimer);
        }
      }, 42);
    }, 420);

    return () => {
      window.clearTimeout(startTimer);
      if (typingTimer) window.clearInterval(typingTimer);
    };
  }, [text]);

  return value;
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
