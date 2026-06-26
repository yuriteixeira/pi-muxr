import http from "node:http";
import { WEB_PAGE } from "./page.js";
import { readVendorAsset } from "./assets.js";
import { getBase16TerminalTheme } from "./base16-theme.js";

export interface WebServerOptions {
  host?: string;
  port?: number;
}

export function runWebServer(options: WebServerOptions = {}): void {
  void startWebServer(options);
}

async function startWebServer(options: WebServerOptions): Promise<void> {
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.PORT ?? 3042);
  const server = http.createServer(handleRequest);
  const { attachTerminalGateway } = await import("./terminal-gateway.js");

  attachTerminalGateway(server);
  server.listen(port, host, () => {
    console.log(`pi-dash web listening on http://${host}:${port}`);
  });
}

function handleRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
  void routeRequest(request, response).catch((error: unknown) => {
    send(response, 500, "application/json; charset=utf-8", JSON.stringify({ message: formatError(error) }));
  });
}

async function routeRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method !== "GET") {
    send(response, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }

  if (url.pathname === "/api/terminal-theme") {
    send(response, 200, "application/json; charset=utf-8", JSON.stringify({ theme: await getBase16TerminalTheme() }));
    return;
  }

  const asset = readVendorAsset(url.pathname);
  if (asset) {
    send(response, 200, asset.contentType, asset.body);
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    send(response, 200, "text/html; charset=utf-8", WEB_PAGE);
    return;
  }

  send(response, 404, "text/plain; charset=utf-8", "Not found");
}

function send(response: http.ServerResponse, statusCode: number, contentType: string, body: string | Buffer): void {
  response.writeHead(statusCode, { "content-type": contentType });
  response.end(body);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
