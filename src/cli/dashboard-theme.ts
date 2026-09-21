export type StyleFn = (text: string) => string;

export type AnsiColor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export interface Base16Palette {
  base00: AnsiColor;
  base01: AnsiColor;
  base02: AnsiColor;
  base03: AnsiColor;
  base04: AnsiColor;
  base05: AnsiColor;
  base06: AnsiColor;
  base07: AnsiColor;
  base08: AnsiColor;
  base09: AnsiColor;
  base0A: AnsiColor;
  base0B: AnsiColor;
  base0C: AnsiColor;
  base0D: AnsiColor;
  base0E: AnsiColor;
  base0F: AnsiColor;
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
  base00: 0,
  base01: 8,
  base02: 8,
  base03: 8,
  base04: 8,
  base05: 7,
  base06: 15,
  base07: 15,
  base08: 9,
  base09: 3,
  base0A: 11,
  base0B: 10,
  base0C: 14,
  base0D: 12,
  base0E: 13,
  base0F: 3,
};

export const DEFAULT_DASHBOARD_THEME = createDashboardTheme(DEFAULT_BASE16_PALETTE);

export function createDashboardTheme(palette: Base16Palette): DashboardTheme {
  return {
    palette,
    background: ansiBackground(palette.base00),
    surface: identity,
    selectedSurface: ansiBackground(palette.base01),
    border: ansiForeground(palette.base03),
    muted: ansiForeground(palette.base04),
    text: ansiForeground(palette.base05),
    bright: compose(ansiForeground(palette.base06), bold),
    accent: ansiForeground(palette.base0D),
    success: ansiForeground(palette.base0B),
    warning: ansiForeground(palette.base0A),
    error: ansiForeground(palette.base08),
    info: ansiForeground(palette.base0C),
    purple: ansiForeground(palette.base0E),
    stale: ansiForeground(palette.base04),
  };
}

export function ansiForeground(color: AnsiColor): StyleFn {
  const code = color < 8 ? 30 + color : 82 + color;
  return (text) => `\x1b[${code}m${text}\x1b[39m`;
}

export function ansiBackground(color: AnsiColor): StyleFn {
  const code = color < 8 ? 40 + color : 92 + color;
  return (text) => `\x1b[${code}m${text}\x1b[49m`;
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
