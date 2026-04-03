import type { VisibleToast } from "@/hooks/useGardenLogs";
import { logVerb, logEmoji } from "@/hooks/useGardenLogs";

export function GardenLogToasts({ toasts }: { toasts: VisibleToast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((toast, i) => (
        <div
          key={toast.id}
          className="pointer-events-auto"
          style={{
            maxWidth: 260,
            background: "#2C1810",
            color: "#F7F0E6",
            borderRadius: 12,
            padding: "12px 16px",
            opacity: toast.exiting ? 0 : 1,
            transform: toast.exiting
              ? "translateY(4px)"
              : `translateY(0)`,
            transition: toast.exiting
              ? "opacity 500ms ease, transform 500ms ease"
              : "opacity 300ms ease, transform 300ms ease",
            animation: toast.exiting ? undefined : "garden-toast-enter 300ms ease forwards",
          }}
        >
          <p style={{ fontSize: 11, color: "#C17F24", marginBottom: 2 }}>
            {toast.momentName}
          </p>
          <p style={{ fontSize: 14 }}>
            {toast.guestName} {logVerb(toast.templateType)} {logEmoji(toast.templateType)}
          </p>
        </div>
      ))}
    </div>
  );
}
