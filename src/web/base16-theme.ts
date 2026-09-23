import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type TerminalTheme = {
  name: string;
  foreground: string;
  background: string;
  cursor: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

type ColorMap = Record<string, string>;

const XTERM_COLOR_NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

export async function getBase16TerminalTheme(): Promise<TerminalTheme | null> {
  const themeName = process.env.BASE16_THEME?.trim();
  if (!themeName) return null;

  const script = await readBase16Script(themeName);
  if (!script) return null;

  const colors = parseBase16Colors(script);
  if (!hasRequiredColors(colors)) return null;

  return {
    name: themeName,
    foreground: colors.color_foreground,
    background: colors.color_background,
    cursor: colors.color_foreground,
    ...Object.fromEntries(
      XTERM_COLOR_NAMES.map((name, index) => [name, colors[`color${String(index).padStart(2, "0")}`]]),
    ),
  } as TerminalTheme;
}

async function readBase16Script(themeName: string): Promise<string | null> {
  const path = join(homedir(), ".config", "base16-shell", "scripts", `base16-${themeName}.sh`);
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function parseBase16Colors(script: string): ColorMap {
  const colors: ColorMap = {};

  for (const line of script.split("\n")) {
    const match = line.match(
      /^(color(?:\d{2}|_foreground|_background))=(?:"([0-9a-fA-F]{2}\/[0-9a-fA-F]{2}\/[0-9a-fA-F]{2})"|\$(color\d{2}))/,
    );
    if (!match) continue;

    const [, name, literal, reference] = match;
    const resolved = literal ? toHexColor(literal) : colors[reference];
    if (resolved) colors[name] = resolved;
  }

  return colors;
}

function toHexColor(base16Color: string): string {
  return `#${base16Color.replaceAll("/", "")}`;
}

function hasRequiredColors(colors: ColorMap): boolean {
  return Boolean(
    colors.color_foreground &&
    colors.color_background &&
    XTERM_COLOR_NAMES.every((_, index) => colors[`color${String(index).padStart(2, "0")}`]),
  );
}
