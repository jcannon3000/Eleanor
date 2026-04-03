import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { logger } from "./logger";

// ── Types ────────────────────────────────────────────────────────────────────

interface PresenceInfo {
  user_id: number;
  display_name: string;
  email: string;
  avatar_url: string | null;
  joined_at: string;
}

interface ClientState {
  ws: WebSocket;
  userId: number | null;
  email: string | null;
  presence: PresenceInfo | null;
}

// ── State ────────────────────────────────────────────────────────────────────

const clients = new Map<WebSocket, ClientState>();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Broadcast a log notification to all connected clients.
 * Each client filters on their own (only shows logs for practices they're in).
 */
export function broadcastLog(payload: {
  momentId: number;
  postId: number;
  momentName: string;
  templateType: string | null;
  guestName: string;
  userEmail: string;
}) {
  const msg = JSON.stringify({ type: "new-log", payload });
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

/**
 * Get all currently present users.
 */
function getPresenceList(): PresenceInfo[] {
  const list: PresenceInfo[] = [];
  const seen = new Set<number>();
  for (const state of clients.values()) {
    if (state.presence && state.userId && !seen.has(state.userId)) {
      seen.add(state.userId);
      list.push(state.presence);
    }
  }
  return list;
}

function broadcastPresenceSync() {
  const presence = getPresenceList();
  const msg = JSON.stringify({ type: "presence-sync", presence });
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

export function attachWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const state: ClientState = { ws, userId: null, email: null, presence: null };
    clients.set(ws, state);

    // Send current presence state to new client
    ws.send(JSON.stringify({ type: "presence-sync", presence: getPresenceList() }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));

        if (msg.type === "track" && msg.payload) {
          const p = msg.payload as PresenceInfo;
          state.userId = p.user_id;
          state.email = p.email;
          state.presence = p;
          broadcastPresenceSync();
        }

        if (msg.type === "untrack") {
          state.presence = null;
          broadcastPresenceSync();
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      const hadPresence = state.presence !== null;
      clients.delete(ws);
      if (hadPresence) {
        broadcastPresenceSync();
      }
    });

    ws.on("error", () => {
      clients.delete(ws);
    });
  });

  logger.info("WebSocket server attached at /ws");
}
