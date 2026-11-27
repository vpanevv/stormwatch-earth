import { useId } from "react";

/**
 * The StormWatch app icon: a planet with a cyclone over it, a strike from the eye, and the radar-lock brackets the
 * app uses for a locked place. Same drawing as public/brand/stormwatch-icon.svg (the favicon and share-card source);
 * keep the two in step. `tile` draws the dark rounded square behind it.
 */
export function AppMark({ size = 32, tile = true, className = "", title }: { size?: number; tile?: boolean; className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  const u = (n: string) => `url(#${id}${n})`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={`${id}bg`} cx="30%" cy="22%" r="95%">
          <stop offset="0" stopColor="#1a1f27" />
          <stop offset="1" stopColor="#040508" />
        </radialGradient>
        <radialGradient id={`${id}planet`} cx="34%" cy="30%" r="78%">
          <stop offset="0" stopColor="#2c5d86" />
          <stop offset=".45" stopColor="#143049" />
          <stop offset=".8" stopColor="#08121d" />
          <stop offset="1" stopColor="#05090f" />
        </radialGradient>
        <radialGradient id={`${id}rim`} cx="50%" cy="50%" r="50%">
          <stop offset=".86" stopColor="#7fb4ff" stopOpacity="0" />
          <stop offset=".97" stopColor="#9cc6ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#9cc6ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}bolt`} x1="0" y1="0" x2=".35" y2="1">
          <stop offset="0" stopColor="#ffc184" />
          <stop offset=".5" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#e14d06" />
        </linearGradient>
        <clipPath id={`${id}g`}>
          <circle cx="32" cy="32" r="17" />
        </clipPath>
      </defs>
      {tile && <rect width="64" height="64" rx="14" fill={u("bg")} />}
      <circle cx="32" cy="32" r="17" fill={u("planet")} />
      <g clipPath={u("g")} fill="none" stroke="#ece8e0" strokeLinecap="round">
        <path d="M32 26.2c6.4-.3 11.2 3.7 11.6 9.4" strokeWidth="3" strokeOpacity=".9" />
        <path d="M43.6 35.6c.4 6-4.2 10.6-10.4 11" strokeWidth="2.2" strokeOpacity=".45" />
        <path d="M32 37.8c-6.4.3-11.2-3.7-11.6-9.4" strokeWidth="3" strokeOpacity=".9" />
        <path d="M20.4 28.4c-.4-6 4.2-10.6 10.4-11" strokeWidth="2.2" strokeOpacity=".45" />
      </g>
      <circle cx="32" cy="32" r="17.6" fill={u("rim")} />
      <circle cx="32" cy="32" r="17" fill="none" stroke="#ece8e0" strokeOpacity=".55" strokeWidth="1" />
      <g fill="none" stroke="#ff7a1a" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12.6 20.2A23.5 23.5 0 0 1 20.2 12.6" />
        <path d="M43.8 12.6a23.5 23.5 0 0 1 7.6 7.6" />
        <path d="M51.4 43.8a23.5 23.5 0 0 1-7.6 7.6" />
        <path d="M20.2 51.4a23.5 23.5 0 0 1-7.6-7.6" />
      </g>
      <path
        d="M34.6 21.5 26.9 33.8h5.6l-2.6 9.8 9-14.2h-5.7l2.9-7.9Z"
        fill={u("bolt")}
        stroke="#05070a"
        strokeWidth="1.8"
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}
