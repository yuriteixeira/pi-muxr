import type http from "node:http";
import { URL } from "node:url";
import { spawn, type IPty } from "node-pty";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { loadConfig } from "../config/config.js";
import { openDatabase } from "../state/database.js";
import type { ClientMessage, ServerMessage } from "./protocol.js";
import { createNotificationMonitor } from "./notifications.js";
import { ensurePiMuxrSession, hideTmuxStatus, isValidSessionName, restoreTmuxStatus } from "./tmux-session.js";

export function attachTerminalGateway(server: http.Server): void {
  const websocketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname !== "/ws/terminal") {
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request, url);
    });
  });

  websocketServer.on("connection", (websocket: WebSocket, _request: http.IncomingMessage, url: URL) => {
    void attachTerminal(websocket, url);
  });
}

async function attachTerminal(websocket: WebSocket, url: URL): Promise<void> {
  const session = url.searchParams.get("session")?.trim() || "pi-muxr-web";
  if (!isValidSessionName(session)) {
    sendJson(websocket, { type: "error", message: "Invalid tmux session name." });
    websocket.close();
    return;
  }

  let terminal: IPty;
  try {
    await ensurePiMuxrSession(session);
    await hideTmuxStatus(session);
    terminal = spawn("tmux", ["attach-session", "-t", session], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: process.env.HOME,
      env: process.env,
    });
  } catch (error) {
    restoreTmuxStatus(session);
    sendJson(websocket, { type: "error", message: formatError(error) });
    websocket.close();
    return;
  }
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const notifications = createNotificationMonitor(db, config);
  const notificationTimer = setInterval(() => sendMessages(websocket, notifications.poll()), 1_000);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(notificationTimer);
    terminal.kill();
    restoreTmuxStatus(session);
    db.close();
  };
  const release = () => {
    if (closed) return;
    closed = true;
    clearInterval(notificationTimer);
    restoreTmuxStatus(session);
    db.close();
  };

  terminal.onData((data) => sendJson(websocket, { type: "output", data }));
  terminal.onExit(({ exitCode }) => {
    sendJson(websocket, { type: "exit", code: exitCode });
    websocket.close();
    release();
  });
  websocket.on("message", (message) => handleClientMessage(terminal, websocket, message.toString()));
  websocket.on("close", close);
  websocket.on("error", close);
}

function handleClientMessage(terminal: IPty, websocket: WebSocket, data: string): void {
  try {
    const message = JSON.parse(data) as ClientMessage;
    if (message.type === "input" && typeof message.data === "string") {
      terminal.write(message.data);
      return;
    }
    if (message.type === "resize" && isValidSize(message.cols, message.rows)) {
      terminal.resize(message.cols, message.rows);
      return;
    }
    sendJson(websocket, { type: "error", message: "Unsupported terminal message." });
  } catch {
    sendJson(websocket, { type: "error", message: "Invalid terminal message." });
  }
}

function isValidSize(cols: number, rows: number): boolean {
  return Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0;
}

function sendMessages(websocket: WebSocket, messages: ServerMessage[]): void {
  for (const message of messages) sendJson(websocket, message);
}

function sendJson(websocket: WebSocket, message: ServerMessage): void {
  if (websocket.readyState === websocket.OPEN) websocket.send(JSON.stringify(message));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
