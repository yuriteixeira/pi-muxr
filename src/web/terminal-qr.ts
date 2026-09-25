import qrcode from "qrcode-terminal";

export type WriteTerminalLine = (line: string) => void;

export function printWebServerAddress(url: string, writeLine: WriteTerminalLine = console.log): void {
  writeLine(`pi-muxr web listening on ${url}`);
  qrcode.generate(url, { small: true }, writeLine);
}
