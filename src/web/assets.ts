import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

export interface AssetResponse {
  contentType: string;
  body: string | Buffer;
}

export function readVendorAsset(pathname: string): AssetResponse | null {
  if (pathname === "/vendor/xterm.js") return javascriptAsset("@xterm/xterm/lib/xterm.js");
  if (pathname === "/vendor/addon-fit.js") return javascriptAsset("@xterm/addon-fit/lib/addon-fit.js");
  if (pathname === "/vendor/xterm.css") return textAsset("@xterm/xterm/css/xterm.css", "text/css; charset=utf-8");
  return null;
}

function javascriptAsset(specifier: string): AssetResponse {
  return textAsset(specifier, "application/javascript; charset=utf-8");
}

function textAsset(specifier: string, contentType: string): AssetResponse {
  return { contentType, body: readFileSync(require.resolve(specifier), "utf8") };
}
