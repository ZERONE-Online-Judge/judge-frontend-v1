import { useId } from 'react';

const metals = {
  1: {
    name: '금메달',
    light: '#fff4ba',
    face: '#edc353',
    edge: '#a86a12',
    dark: '#835015',
  },
  2: {
    name: '은메달',
    light: '#f7fbff',
    face: '#bdccdf',
    edge: '#71829c',
    dark: '#4b607c',
  },
  3: {
    name: '동메달',
    light: '#ffe1c5',
    face: '#dca16d',
    edge: '#9d5f36',
    dark: '#754226',
  },
};

/** A local SVG medal, so a projection never waits on an external image. */
export default function PresentationMedal({ rank }: { rank: 1 | 2 | 3 }) {
  const id = useId().replace(/:/g, '');
  const metal = metals[rank];
  const gradient = `${id}-metal`;
  const rim = `${id}-rim`;
  const ribbon = `${id}-ribbon`;
  return (
    <svg
      className="presentation-awards-medal"
      viewBox="0 0 160 190"
      role="img"
      aria-label={`${rank}위 ${metal.name}`}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={metal.light} />
          <stop offset=".28" stopColor={metal.face} />
          <stop offset=".48" stopColor={metal.light} />
          <stop offset=".7" stopColor={metal.face} />
          <stop offset="1" stopColor={metal.edge} />
        </linearGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={metal.light} />
          <stop offset=".4" stopColor={metal.edge} />
          <stop offset=".7" stopColor={metal.light} />
          <stop offset="1" stopColor={metal.dark} />
        </linearGradient>
        <linearGradient id={ribbon} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#b9a4f7" />
          <stop offset=".5" stopColor="#7453cc" />
          <stop offset="1" stopColor="#3d2779" />
        </linearGradient>
      </defs>
      <g aria-hidden="true">
        <path d="m34 8 34 1 29 68-29 17Z" fill={`url(#${ribbon})`} />
        <path d="m92 9 34-1-34 86-29-17Z" fill={`url(#${ribbon})`} />
        <path d="m43 9 7 .2 30 69-6 3Z" fill="#e5dcff" opacity=".55" />
        <path d="m110 9 7-.2-32 72-6-3Z" fill="#e5dcff" opacity=".55" />
        <ellipse cx="80" cy="173" rx="45" ry="6" fill="#000" opacity=".14" />
        <circle cx="80" cy="112" r="59" fill={metal.dark} opacity=".55" />
        <circle cx="80" cy="108" r="59" fill={`url(#${rim})`} />
        {Array.from({ length: 36 }, (_, index) => (
          <path
            key={index}
            d="M80 51v5"
            transform={`rotate(${index * 10} 80 108)`}
            stroke={metal.dark}
            strokeWidth="1.5"
            opacity=".32"
          />
        ))}
        <circle cx="80" cy="108" r="51" fill={`url(#${gradient})`} />
        <circle
          cx="80"
          cy="108"
          r="46"
          fill="none"
          stroke={metal.light}
          opacity=".75"
        />
        <circle
          cx="80"
          cy="108"
          r="42"
          fill="none"
          stroke={metal.dark}
          opacity=".25"
        />
        <path
          d="M53 129q-15-18-4-40m58 40q15-18 4-40"
          fill="none"
          stroke={metal.dark}
          strokeWidth="2"
          opacity=".65"
        />
        {[0, 1, 2, 3].map((index) => (
          <g key={index} fill={metal.dark} opacity=".6">
            <ellipse
              cx={47 + index * 0.9}
              cy={95 + index * 8}
              rx="3"
              ry="5"
              transform={`rotate(${-40 - index * 8} ${47 + index * 0.9} ${95 + index * 8})`}
            />
            <ellipse
              cx={113 - index * 0.9}
              cy={95 + index * 8}
              rx="3"
              ry="5"
              transform={`rotate(${40 + index * 8} ${113 - index * 0.9} ${95 + index * 8})`}
            />
          </g>
        ))}
        <path
          d="m80 69 2.4 5 5.6.8-4 4 1 5.5-5-2.6-5 2.6 1-5.5-4-4 5.6-.8Z"
          fill={metal.dark}
          opacity=".7"
        />
        <text
          x="80"
          y="125"
          textAnchor="middle"
          fill={metal.dark}
          fontFamily="inherit"
          fontWeight="800"
          fontSize="43"
          letterSpacing="-2"
        >
          {rank}
        </text>
        <path
          d="M51 145q29 15 58 0"
          fill="none"
          stroke={metal.light}
          strokeWidth="2"
          opacity=".65"
        />
      </g>
    </svg>
  );
}
