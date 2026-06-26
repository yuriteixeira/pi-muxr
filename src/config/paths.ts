import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return join(homedir(), input.slice(2));
  return input;
}

export function defaultStateDir(): string {
  return join(homedir(), ".pi-dash");
}

export function defaultDatabasePath(): string {
  return join(defaultStateDir(), "pi-dash.sqlite");
}

export function defaultConfigPath(): string {
  return join(defaultStateDir(), "config.json");
}

export function parentDir(path: string): string {
  return dirname(path);
}
