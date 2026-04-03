import { useEffect, useRef, useState, useCallback } from "react";
import type { LogEvent } from "./useGardenSocket";

export interface GardenLogEvent {
  id: string;
  momentName: string;
  guestName: string;
  templateType: string | null;
  timestamp: number;
}

const TOAST_DURATION = 4000;
const TOAST_EXIT_DURATION = 500;
const MAX_VISIBLE = 2;

export function logVerb(templateType: string | null): string {
  switch (templateType) {
    case "morning-prayer":
    case "evening-prayer":
    case "intercession":
      return "just prayed";
    case "fasting":
      return "is fasting";
    default:
      return "just practiced";
  }
}

export function logEmoji(templateType: string | null): string {
  switch (templateType) {
    case "morning-prayer":
    case "evening-prayer":
    case "intercession":
      return "\u{1F64F}";
    default:
      return "\u{1F33F}";
  }
}

export interface VisibleToast extends GardenLogEvent {
  exiting: boolean;
}

/**
 * Manages toast queue from incoming log events.
 * Pass in the raw logEvents from useGardenSocket.
 */
export function useGardenLogToasts(logEvents: LogEvent[]) {
  const [visibleToasts, setVisibleToasts] = useState<VisibleToast[]>([]);
  const queueRef = useRef<GardenLogEvent[]>([]);
  const seenRef = useRef(new Set<string>());
  const processedCountRef = useRef(0);

  const showNext = useCallback(() => {
    setVisibleToasts(current => {
      const active = current.filter(t => !t.exiting);
      if (active.length >= MAX_VISIBLE || queueRef.current.length === 0) return current;
      const next = queueRef.current.shift()!;
      return [...current, { ...next, exiting: false }];
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setVisibleToasts(current =>
      current.map(t => t.id === id ? { ...t, exiting: true } : t)
    );
    setTimeout(() => {
      setVisibleToasts(current => current.filter(t => t.id !== id));
      showNext();
    }, TOAST_EXIT_DURATION);
  }, [showNext]);

  const enqueueToast = useCallback((event: GardenLogEvent) => {
    if (seenRef.current.has(event.id)) return;
    seenRef.current.add(event.id);
    queueRef.current.push(event);
    showNext();
    setTimeout(() => dismissToast(event.id), TOAST_DURATION + 300);
  }, [showNext, dismissToast]);

  // Process new log events as they arrive
  useEffect(() => {
    if (logEvents.length <= processedCountRef.current) return;

    const newEvents = logEvents.slice(processedCountRef.current);
    processedCountRef.current = logEvents.length;

    for (const e of newEvents) {
      enqueueToast({
        id: `log-${e.postId}`,
        momentName: e.momentName,
        guestName: e.guestName,
        templateType: e.templateType,
        timestamp: Date.now(),
      });
    }
  }, [logEvents, enqueueToast]);

  return { visibleToasts };
}
