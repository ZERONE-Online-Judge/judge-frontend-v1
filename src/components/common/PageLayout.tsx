import type { ReactNode } from 'react';

type PageHeadingVariant = 'page' | 'contest' | 'section' | 'management';
type PageWidth = '5xl' | '6xl' | '7xl' | 'full';

type PageHeadingProps = {
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  level?: 1 | 2;
  title: ReactNode;
  variant?: PageHeadingVariant;
};

type PageLayoutProps = {
  children: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
  width?: PageWidth;
  variant?: 'page' | 'management';
};

const widthClasses: Record<PageWidth, string> = {
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-[112rem]',
};

const headingClasses: Record<PageHeadingVariant, string> = {
  management:
    'break-keep text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl',
  page: 'break-keep text-2xl font-black tracking-normal text-slate-950 sm:text-3xl',
  contest:
    'break-keep text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl',
  section: 'break-keep text-xl font-black text-slate-950 sm:text-2xl',
};

const descriptionClasses: Record<PageHeadingVariant, string> = {
  management: 'max-w-4xl text-sm leading-6 font-normal text-slate-500',
  page: 'text-sm leading-6 text-slate-600 sm:text-base sm:leading-7',
  contest: 'max-w-4xl text-sm leading-6 font-normal text-slate-500',
  section: 'text-sm leading-6 text-slate-600',
};

const eyebrowClasses: Record<PageHeadingVariant, string> = {
  management: 'text-xs font-medium tracking-wide text-indigo-600',
  page: 'text-sm font-bold text-zoj-blue',
  contest: 'text-sm font-bold text-zoj-blue',
  section:
    'w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-zoj-blue',
};

export function PageHeading({
  className,
  description,
  eyebrow,
  level = 1,
  title,
  variant = 'page',
}: PageHeadingProps) {
  const HeadingTag = level === 2 ? 'h2' : 'h1';

  return (
    <header
      className={['grid min-w-0 gap-2', className].filter(Boolean).join(' ')}
    >
      {eyebrow ? (
        <span className={eyebrowClasses[variant]}>{eyebrow}</span>
      ) : null}
      <HeadingTag className={`zoj-break-anywhere ${headingClasses[variant]}`}>
        {title}
      </HeadingTag>
      {description ? (
        <p className={descriptionClasses[variant]}>{description}</p>
      ) : null}
    </header>
  );
}

export default function PageLayout({
  children,
  actions,
  navigation,
  description,
  eyebrow,
  title,
  width = '7xl',
  variant = 'page',
}: PageLayoutProps) {
  const content = (
    <>
      {navigation && title ? (
        <div className="operator-page-heading">
          <PageHeading
            description={description}
            title={title}
            variant={variant}
          />
          {actions ? (
            <div className="operator-page-heading__actions">{actions}</div>
          ) : null}
        </div>
      ) : title ? (
        <PageHeading
          description={description}
          eyebrow={navigation ? undefined : eyebrow}
          title={title}
          variant={variant}
        />
      ) : null}
      {children}
    </>
  );
  return (
    <section
      className={[
        'animate-page-enter mx-auto grid w-full min-w-0 grid-cols-1 px-4 font-sans sm:px-6 lg:px-8',
        variant === 'management'
          ? 'zoj-management gap-5 py-6 sm:gap-6 sm:py-8'
          : 'gap-6 py-10 sm:gap-8 sm:py-14',
        widthClasses[width],
        navigation ? 'operator-layout' : '',
      ].join(' ')}
    >
      {navigation ? (
        <>
          <aside className="operator-layout__navigation">{navigation}</aside>
          <div className="operator-layout__content">{content}</div>
        </>
      ) : (
        content
      )}
    </section>
  );
}
