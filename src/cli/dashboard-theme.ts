export type StyleFn = (text: string) => string;

export interface Base16Palette {
  base00: string;
  base01: string;
  base02: string;
  base03: string;
  base04: string;
  base05: string;
  base06: string;
  base07: string;
  base08: string;
  base09: string;
  base0A: string;
  base0B: string;
  base0C: string;
  base0D: string;
  base0E: string;
  base0F: string;
}

export interface DashboardTheme {
  palette: Base16Palette;
  background: StyleFn;
  surface: StyleFn;
  selectedSurface: StyleFn;
  border: StyleFn;
  muted: StyleFn;
  text: StyleFn;
  bright: StyleFn;
  accent: StyleFn;
  success: StyleFn;
  warning: StyleFn;
  error: StyleFn;
  info: StyleFn;
  purple: StyleFn;
  stale: StyleFn;
}

export const DEFAULT_BASE16_PALETTE: Base16Palette = {
  base00: "#101317",
  base01: "#171b21",
  base02: "#242a33",
  base03: "#3a424d",
  base04: "#7d8794",
  base05: "#c9d1d9",
  base06: "#e6edf3",
  base07: "#ffffff",
  base08: "#ff6b6b",
  base09: "#f59f00",
  base0A: "#ffd43b",
  base0B: "#69db7c",
  base0C: "#66d9e8",
  base0D: "#74c0fc",
  base0E: "#b197fc",
  base0F: "#ffa94d",
};

export const DEFAULT_DASHBOARD_THEME = createDashboardTheme(DEFAULT_BASE16_PALETTE);

export function createDashboardTheme(palette: Base16Palette): DashboardTheme {
  return {
    palette,
    background: bg(palette.base00),
    surface: identity,
    selectedSurface: bg(palette.base01),
    border: fg(palette.base03),
    muted: fg(palette.base04),
    text: fg(palette.base05),
    bright: compose(fg(palette.base06), bold),
    accent: fg(palette.base0D),
    success: fg(palette.base0B),
    warning: fg(palette.base0A),
    error: fg(palette.base08),
    info: fg(palette.base0C),
    purple: fg(palette.base0E),
    stale: fg(palette.base04),
  };
}

export function fg(hex: string): StyleFn {
  const [r, g, b] = parseHex(hex);
  return (text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

export function bg(hex: string): StyleFn {
  const [r, g, b] = parseHex(hex);
  return (text) => `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m`;
}

export function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

function compose(...styles: StyleFn[]): StyleFn {
  return (text) => styles.reduceRight((value, style) => style(value), text);
}

function identity(text: string): string {
  return text;
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return [255, 255, 255];
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}
