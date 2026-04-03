import { useEffect, useRef, useState, useCallback } from "react";
import type { AuthUser } from "./useAuth";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PresenceUser {
  user_id: number;
  display_name: string;
  email: string;
  avatar_url: string | null;
  joined_at: string;
}

export interface LogEvent {
  momentId: number;
  postId: number;
  momentName: string;
  templateType: string | null;
  guestName: string;
  userEmail: string;
}

type MessageHandler = (msg: { type: string; [key: string]: unknown }) => void;

// ── Singleton WebSocket ──────────────────────────────────────────────────────

let sharedSocket: WebSocket | null = null;
let handlers = new Set<MessageHandler>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function ensureSocket() {
  if (sharedSocket && sharedSocket.readyState <= WebSocket.OPEN) return;

  sharedSocket = new WebSocket(getWsUrl());

  sharedSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handlers.forEach(h => h(msg));
    } catch { /* ignore */ }
  };

  sharedSocket.onclose = () => {
    sharedSocket = null;
    // Reconnect after 3 seconds
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => ensureSocket(), 3000);
  };

  sharedSocket.onerror = () => {
    sharedSocket?.close();
  };
}

function sendMessage(msg: Record<string, unknown>) {
  if (sharedSocket?.readyState === WebSocket.OPEN) {
    sharedSocket.send(JSON.stringify(msg));
  }
}

function subscribe(handler: MessageHandler) {
  handlers.add(handler);
  ensureSocket();
  return () => {
    handlers.delete(handler);
    // Don't close the socket — other hooks may still be listening
  };
}

// ── Hooks ────────────────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Tracks presence and listens for log notifications over a single WebSocket.
 */
export function useGardenSocket(user: AuthUser | null, gardenEmails: Set<string>, userMomentIds: Set<number>) {
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);
  const [logEvents, setLogEvents] = useState<LogEvent[]>([]);
  const isTrackedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const track = useCallback(() => {
    if (!user || !user.showPresence || isTrackedRef.current) return;
    sendMessage({
      type: "track",
      payload: {
        user_id: user.id,
        display_name: user.name,
        email: user.email,
        avatar_url: user.avatarUrl,
        joined_at: new Date().toISOString(),
      },
    });
    isTrackedRef.current = true;
  }, [user]);

  const untrack = useCallback(() => {
    if (!isTrackedRef.current) return;
    sendMessage({ type: "untrack" });
    isTrackedRef.current = false;
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!isTrackedRef.current && user?.showPresence) track();
    idleTimerRef.current = setTimeout(() => untrack(), IDLE_TIMEOUT_MS);
  }, [track, untrack, user?.showPresence]);

  useEffect(() => {
    if (!user) return;

    const handleMessage: MessageHandler = (msg) => {
      if (msg.type === "presence-sync") {
        const all = (msg.presence as PresenceUser[]) ?? [];
        // Filter: garden members only, not self
        const filtered = all.filter(
          p => p.user_id !== user.id && gardenEmails.has(p.email)
        );
        setPresentUsers(filtered);
      }

      if (msg.type === "new-log") {
        const payload = msg.payload as LogEvent;
        if (!payload) return;
        // Don't show own logs
        if (payload.userEmail?.toLowerCase() === user.email.toLowerCase()) return;
        // Only practices user is in
        if (!userMomentIds.has(payload.momentId)) return;
        setLogEvents(prev => [...prev, payload]);
      }
    };

    const unsub = subscribe(handleMessage);

    // Track presence once socket is ready
    const trackWhenReady = () => {
      if (sharedSocket?.readyState === WebSocket.OPEN && user.showPresence) {
        track();
        resetIdleTimer();
      } else {
        // Wait for socket to open
        const check = setInterval(() => {
          if (sharedSocket?.readyState === WebSocket.OPEN) {
            clearInterval(check);
            if (user.showPresence) {
              track();
              resetIdleTimer();
            }
          }
        }, 200);
        setTimeout(() => clearInterval(check), 10000); // give up after 10s
      }
    };
    trackWhenReady();

    // Visibility change
    const handleVisibility = () => {
      if (document.hidden) {
        untrack();
      } else if (user.showPresence) {
        track();
        resetIdleTimer();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Idle timer
    const handleActivity = () => resetIdleTimer();
    const events = ["mousemove", "keydown", "scroll", "touchstart"] as const;
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    resetIdleTimer();

    return () => {
      unsub();
      untrack();
      document.removeEventListener("visibilitychange", handleVisibility);
      events.forEach(e => window.removeEventListener(e, handleActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      isTrackedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.showPresence, gardenEmails.size, userMomentIds.size]);

  // Consume log events (caller should clear after processing)
  const consumeLogEvents = useCallback(() => {
    const events = [...logEvents];
    setLogEvents([]);
    return events;
  }, [logEvents]);

  return { presentUsers, logEvents, consumeLogEvents };
}
