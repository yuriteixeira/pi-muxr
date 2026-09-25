import http from "node:http";
import { loadConfig } from "../config/config.js";
import { openDatabase } from "../state/database.js";
import { markCurrentEventRead } from "../state/write-status.js";
import { readVendorAsset } from "./assets.js";
import { getBase16TerminalTheme } from "./base16-theme.js";
import { readWebDashboardSnapshot } from "./dashboard-data.js";
import { LANDING_PAGE } from "./landing-page.js";
import { TERMINAL_PAGE } from "./page.js";
import { buildWebServerUrl } from "./server-address.js";
import { printWebServerAddress } from "./terminal-qr.js";

export interface WebServerOptions {
  host?: string;
  port?: number;
}

export function runWebServer(options: WebServerOptions = {}): void {
  void startWebServer(options);
}

async function startWebServer(options: WebServerOptions): Promise<void> {
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const port = options.port ?? Number(process.env.PORT ?? 3042);
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const server = http.createServer((request, response) => {
    void routeRequest(
      request,
      response,
      () => readWebDashboardSnapshot(db, config),
      (id, lastEventAt) => markCurrentEventRead(db, id, lastEventAt),
    ).catch((error: unknown) => {
      send(response, 500, "application/json; charset=utf-8", JSON.stringify({ message: formatError(error) }));
    });
  });
  const { attachTerminalGateway } = await import("./terminal-gateway.js");

  attachTerminalGateway(server);
  server.on("close", () => db.close());
  server.listen(port, host, () => {
    printWebServerAddress(buildWebServerUrl(host, port));
  });
}

async function routeRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  readDashboard: () => ReturnType<typeof readWebDashboardSnapshot>,
  markDashboardRowRead: (id: string, lastEventAt: number) => boolean,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/api/dashboard/read" && request.method === "POST") {
    const body = await readJsonBody(request);
    if (!isReadRequest(body)) {
      send(response, 400, "application/json; charset=utf-8", JSON.stringify({ message: "Invalid read request." }));
      return;
    }
    const marked = markDashboardRowRead(body.id, body.lastEventAt);
    send(response, 200, "application/json; charset=utf-8", JSON.stringify({ marked }));
    return;
  }

  if (request.method !== "GET") {
    send(response, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }

  if (url.pathname === "/api/dashboard") {
    send(response, 200, "application/json; charset=utf-8", JSON.stringify(readDashboard()), {
      "cache-control": "no-store",
    });
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
    response.writeHead(302, { location: "/landing" });
    response.end();
    return;
  }

  if (url.pathname === "/landing") {
    send(response, 200, "text/html; charset=utf-8", LANDING_PAGE);
    return;
  }

  if (url.pathname === "/terminal") {
    send(response, 200, "text/html; charset=utf-8", TERMINAL_PAGE);
    return;
  }

  send(response, 404, "text/plain; charset=utf-8", "Not found");
}

function send(
  response: http.ServerResponse,
  statusCode: number,
  contentType: string,
  body: string | Buffer,
  headers: Record<string, string> = {},
): void {
  response.writeHead(statusCode, { "content-type": contentType, ...headers });
  response.end(body);
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function isReadRequest(value: unknown): value is { id: string; lastEventAt: number } {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.id === "string" &&
    request.id.length > 0 &&
    request.id.length <= 500 &&
    typeof request.lastEventAt === "number" &&
    Number.isSafeInteger(request.lastEventAt) &&
    request.lastEventAt >= 0
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
