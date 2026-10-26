const TINTS = [
  ["#e8f0fb", "#1b559d"], ["#e3f5ec", "#0f7a4d"], ["#fdeee3", "#a4511a"],
  ["#efe9fb", "#5b3fb0"], ["#fbe8f0", "#a02c5d"], ["#e5f4f6", "#1d6b78"],
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = TINTS[h % TINTS.length];
  return (
    <span className="avatar" aria-hidden
      style={{ background: bg, color: fg, width: size, height: size, fontSize: size * 0.34 }}>
      {initials(name)}
    </span>
  );
}
