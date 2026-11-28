import type { JSX } from "@solidjs/web";

interface IconProps {
  size?: number;
  class?: JSX.ClassValue;
}

const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.75",
  "stroke-linecap": "round" as const,
  "stroke-linejoin": "round" as const,
  "aria-hidden": "true" as const,
});

export function GiftIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 18)} class={props.class}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

export function RibbonBowIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 18)} class={props.class}>
      <path d="M12 11c-1.8-3.8-5.4-5.2-7-3.4-1.5 1.7-.2 4.6 3.3 4.4 1.4-.1 2.7-.5 3.7-1Z" />
      <path d="M12 11c1.8-3.8 5.4-5.2 7-3.4 1.5 1.7.2 4.6-3.3 4.4-1.4-.1-2.7-.5-3.7-1Z" />
      <path d="M12 11.5 8.5 19" />
      <path d="M12 11.5 15.5 19" />
      <circle cx="12" cy="11.2" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Tactile wax-sealed secret envelope for the anti-spoiler gate. */
export function EnvelopeSealIllustration(props: { class?: string }) {
  return (
    <svg
      width="124"
      height="96"
      viewBox="0 0 124 96"
      fill="none"
      aria-hidden="true"
      class={props.class}
    >
      {/* Paper envelope body */}
      <rect
        x="10"
        y="20"
        width="104"
        height="68"
        rx="10"
        fill="var(--bg-card)"
        stroke="var(--border-primary)"
        stroke-width="1.5"
      />
      {/* Subtle stationery card peeking inside when flap lifts */}
      <rect
        class="envelope-letter"
        x="20"
        y="24"
        width="84"
        height="48"
        rx="6"
        fill="var(--accent-soft-bg)"
        stroke-width="1.2"
      />
      {/* Subtle diagonal lining inside */}
      <path
        d="M12 85 48 53M112 85 76 53"
        stroke="var(--border-subtle)"
        stroke-width="1.35"
        stroke-linecap="round"
      />
      {/* Top envelope flap (gently opens on hover) */}
      <g class="envelope-flap">
        <path
          d="M13 23.5 59.2 57.2a4.8 4.8 0 0 0 5.6 0L111 23.5"
          fill="var(--bg-well)"
          stroke="var(--border-primary)"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        {/* Wax seal */}
        <g class="wax-seal-mark">
          <circle cx="62" cy="56" r="16.5" fill="var(--accent)" />
          <circle
            cx="62"
            cy="56"
            r="12.5"
            fill="none"
            stroke="var(--on-accent)"
            stroke-opacity="0.38"
            stroke-width="1.25"
            stroke-dasharray="2.5 2"
          />
          {/* Embossed bow inside seal */}
          <path
            d="M62 55.5c-1.4-2.8-4.2-3.9-5.4-2.5-1.1 1.3-.1 3.4 2.6 3.3 1.1-.1 2.1-.4 2.8-.8Zm0 0c1.4-2.8 4.2-3.9 5.4-2.5 1.1 1.3.1 3.4-2.6 3.3-1.1-.1-2.1-.4-2.8-.8Zm0 .5-2.6 5.5m2.6-5.5 2.6 5.5"
            stroke="var(--on-accent)"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
      </g>
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 14)} class={props.class}>
      <path d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

export function CircleDotIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 14)} class={props.class}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 14)} class={props.class}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 14)} class={props.class}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 14)} class={props.class}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 16)} class={props.class}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 16)} class={props.class}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16.5" r=".75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 18)} class={props.class}>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
      <path d="M9.5 12.2 11.3 14l3.5-3.6" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 14)} class={props.class}>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 14)} class={props.class}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

export function SparkleLinkIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 14)} class={props.class}>
      <path d="M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13" />
    </svg>
  );
}

export function LayoutGridIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

export function RowsIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

export function ArrowUpDownIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16" />
    </svg>
  );
}

export function ListOrderedIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="M10 12h11M10 18h11M10 6h11M4 10h2M4 6h1v4M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function ArrowUpNarrowWideIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="m3 8 4-4 4 4M7 4v16M11 12h4M11 16h7M11 20h10" />
    </svg>
  );
}

export function ArrowDownWideNarrowIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="m3 16 4 4 4-4M7 20V4M11 4h10M11 8h7M11 12h4" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 14)} class={props.class}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 16)} class={props.class}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 16)} class={props.class}>
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="m12 5 7 7-7 7" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <svg {...base(props.size ?? 15)} class={props.class}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0Z" />
    </svg>
  );
}
