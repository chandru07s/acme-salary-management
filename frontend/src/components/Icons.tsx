import type { ReactNode } from "react";

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

export const IconPeople = () => <Svg><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.3c1.6.6 2.6 2.1 2.9 4.2" /></Svg>;
export const IconChart = () => <Svg><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></Svg>;
export const IconSpark = () => <Svg><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></Svg>;
export const IconSearch = () => <Svg><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Svg>;
export const IconPlus = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const IconDownload = () => <Svg><path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14" /></Svg>;
export const IconArrow = () => <Svg><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const IconClose = () => <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IconShield = () => <Svg><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></Svg>;

export const IconHome = () => <Svg><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" /></Svg>;
export const IconScale = () => <Svg><path d="M12 4v16M6 20h12M5 8h14" /><path d="M5 8 2.5 14a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z" /></Svg>;
export const IconGear = () => <Svg><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></Svg>;

export function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden focusable="false">
      <rect width="32" height="32" rx="9" fill="#1d3a6e" />
      <rect x="7" y="17" width="4.5" height="8" rx="1.5" fill="#9ec5f4" />
      <rect x="13.75" y="11" width="4.5" height="14" rx="1.5" fill="#fff" />
      <rect x="20.5" y="6" width="4.5" height="19" rx="1.5" fill="#9ec5f4" />
    </svg>
  );
}
