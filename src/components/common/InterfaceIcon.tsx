import type { SVGProps } from 'react';

const shapes = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  asterisk: (
    <path
      stroke="none"
      fill="currentColor"
      d="M10.5 2h3v6.38L18 3.88 20.12 6l-4.5 4.5H22v3h-6.38l4.5 4.5L18 20.12l-4.5-4.5V22h-3v-6.38L6 20.12 3.88 18l4.5-4.5H2v-3h6.38L3.88 6 6 3.88l4.5 4.5Z"
    />
  ),
  sparkle: (
    <path
      stroke="none"
      fill="currentColor"
      d="m12 1 3.2 7.8L23 12l-7.8 3.2L12 23l-3.2-7.8L1 12l7.8-3.2Z"
    />
  ),
  check: <path d="m5 12 4 4L19 6" />,
  circle: <circle cx="12" cy="12" r="8" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  minus: <path d="M5 12h14" />,
  arrowUpRight: <path d="M6 18 18 6M6 6h12v12" />,
  arrowLeft: <path d="M21 12H3m6-6-6 6 6 6" />,
  arrowUp: <path d="M12 21V3m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 3v18m-6-6 6 6 6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  diamond: <path d="m12 2 10 10-10 10L2 12Z" />,
  arrowRight: <path d="M3 12h18m-6-6 6 6-6 6" />,
  exchange: <path d="M3 8h18m-4-4 4 4-4 4M21 16H3m4-4-4 4 4 4" />,
  refresh: <path d="M20 7a9 9 0 1 0 1 7M20 2v6h-6" />,
  code: <path d="m7 6-5 6 5 6m10-12 5 6-5 6m-3-15-4 18" />,
  braces: <path d="M8 3H6v6l-3 3 3 3v6h2M16 3h2v6l3 3-3 3v6h-2" />,
  list: <path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6m0 4h.01" />
    </>
  ),
  coffee: (
    <>
      <path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Zm13 1h2a3 3 0 1 1 0 6h-2M8 2v3m5-3v3M3 23h17" />
    </>
  ),
  memory: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9v6m4-6v6m4-6v6m4-6v6" />
    </>
  ),
};

export type InterfaceIconName = keyof typeof shapes;

export default function InterfaceIcon({
  name,
  size = '1em',
  label,
  style,
  ...props
}: SVGProps<SVGSVGElement> & {
  name: InterfaceIconName;
  size?: number | string;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      style={{
        display: 'inline-block',
        flexShrink: 0,
        verticalAlign: '-0.125em',
        ...style,
      }}
      {...props}
    >
      {shapes[name]}
    </svg>
  );
}
