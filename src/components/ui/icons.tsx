import type { SVGProps } from "react";

/** Thin-stroke instrument icons (1.25px) so they sit with the light typography. */
const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconCloud = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 18h10.5a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.3 11.1 3.5 3.5 0 0 0 7 18Z" />
  </svg>
);
export const IconRain = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 14h10.5a3.5 3.5 0 0 0 .3-6.98A5.5 5.5 0 0 0 7.1 7.9 3 3 0 0 0 7 14Z" />
    <path d="m8 17-1 3M12 17l-1 3M16 17l-1 3" />
  </svg>
);
export const IconBolt = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M13 2 5 13.5h6L10 22l8-11.5h-6L13 2Z" />
  </svg>
);
export const IconStorm = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h13M6 11h12M8 15h9M11 19h5" />
    <path d="M17 7c2 0 3 1 3 2.2M18 11c1.6.2 2.4 1 2.4 2" />
  </svg>
);
export const IconThermo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z" />
    <path d="M12 9v7" />
  </svg>
);
export const IconWind = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" />
  </svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);
export const IconCrosshair = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
);
export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 5v14M16 5v14" strokeWidth={2.2} />
  </svg>
);
export const IconRewind = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 5v14" />
    <path d="M19 6.5v11L10 12l9-5.5Z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconStepBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m14 7-5 5 5 5" />
  </svg>
);
export const IconStepFwd = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m10 7 5 5-5 5" />
  </svg>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconArrow = ({ deg = 0, ...p }: SVGProps<SVGSVGElement> & { deg?: number }) => (
  <svg {...base(p)} style={{ transform: `rotate(${deg}deg)`, ...p.style }}>
    <path d="M12 20V5M6.5 10.5 12 5l5.5 5.5" />
  </svg>
);
export const IconPanel = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
    <path d="M14 4.5v15" />
  </svg>
);
export const IconSnow = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
    <path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2M4.6 10.4l3.1.6-1 3M19.4 10.4l-3.1.6 1 3M4.6 13.6l3.1-.6-1-3M19.4 13.6l-3.1-.6 1-3" />
  </svg>
);
export const IconChevron = ({ up = false, ...p }: SVGProps<SVGSVGElement> & { up?: boolean }) => (
  <svg {...base(p)} style={{ transform: up ? "rotate(180deg)" : undefined, ...p.style }}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const IconDroplet = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10Z" />
  </svg>
);
export const IconShare = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M5 12v7h14v-7" />
  </svg>
);
/** Half a sun on the horizon with rays, and an arrow up (sunrise) or down (sunset). */
const SunHorizon = ({ up, ...p }: SVGProps<SVGSVGElement> & { up: boolean }) => (
  <svg {...base(p)}>
    <path d="M7 17a5 5 0 0 1 10 0" />
    <path d="M3 17h18M5 21h14" />
    <path d="M12 7v1.5M5.6 10.6l1.1 1.1M18.4 10.6l-1.1 1.1M3.5 14H5M20.5 14H19" />
    {up ? <path d="M12 2v4M10.2 3.8 12 2l1.8 1.8" /> : <path d="M12 2v4M10.2 4.2 12 6l1.8-1.8" />}
  </svg>
);
export const IconSunrise = (p: SVGProps<SVGSVGElement>) => <SunHorizon up {...p} />;
export const IconSunset = (p: SVGProps<SVGSVGElement>) => <SunHorizon up={false} {...p} />;
