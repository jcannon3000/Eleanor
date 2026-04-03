import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";

/**
 * Dedicated Apple Music auth page. MusicKit loads automatically, then the user
 * taps a button to authorize — this keeps authorize() in a direct user gesture
 * so Safari doesn't block it.
 */
export default function AppleMusicAuth() {
  const [status, setStatus] = useState<"loading" | "ready" | "authorizing" | "saving" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const returnTo = new URLSearchParams(search).get("returnTo") || "/moments";

  // Phase 1: Load MusicKit JS and configure (no user gesture needed)
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const w = window as unknown as Record<string, unknown>;
        if (!w["MusicKit"]) {
          const s = document.createElement("script");
          s.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
          s.async = true;
          document.head.appendChild(s);
          await new Promise<void>((resolve, reject) => {
            let tries = 0;
            const iv = setInterval(() => {
              if (w["MusicKit"]) { clearInterval(iv); resolve(); }
              else if (++tries > 100) { clearInterval(iv); reject(new Error("MusicKit failed to load")); }
            }, 200);
          });
        }
        if (cancelled) return;

        const { token } = await apiRequest<{ token: string }>("GET", "/api/apple-music/developer-token");
        if (cancelled) return;

        const MK = w["MusicKit"] as { configure: (opts: object) => Promise<void> };
        await MK.configure({ developerToken: token, app: { name: "Eleanor", build: "1.0.0" } });
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setStatus("error");
        }
      }
    }

    void init();
    return () => { cancelled = true; };
  }, []);

  // Phase 2: User taps button → authorize() runs in direct click handler
  async function handleAuthorize() {
    setStatus("authorizing");
    try {
      const w = window as unknown as Record<string, unknown>;
      const MK = w["MusicKit"] as {
        getInstance: () => { authorize: () => Promise<string> };
      };
      const musicUserToken = await MK.getInstance().authorize();

      setStatus("saving");
      await apiRequest("POST", "/api/apple-music/connect", { musicUserToken });

      setStatus("done");
      setTimeout(() => setLocation(returnTo, { replace: true }), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F0] px-6">
      <div className="text-center max-w-sm">
        {status === "loading" && (
          <>
            <p className="text-2xl mb-3">🎵</p>
            <p className="text-[#2C1A0E] font-medium">Loading Apple Music...</p>
          </>
        )}
        {status === "ready" && (
          <>
            <p className="text-2xl mb-4">🎵</p>
            <p className="text-[#2C1A0E] font-medium mb-2">Ready to connect</p>
            <p className="text-sm text-[#6b5c4a]/70 mb-6">Tap below to authorize Eleanor with your Apple Music account</p>
            <button
              onClick={handleAuthorize}
              className="w-full py-3 rounded-xl font-medium text-sm text-white transition-all"
              style={{ background: "linear-gradient(135deg, #FC3C44 0%, #fa233b 100%)" }}
            >
              Authorize Apple Music
            </button>
          </>
        )}
        {status === "authorizing" && (
          <>
            <p className="text-2xl mb-3">🎵</p>
            <p className="text-[#2C1A0E] font-medium">Connecting...</p>
            <p className="text-sm text-[#6b5c4a]/70 mt-2">Follow the prompts to authorize</p>
          </>
        )}
        {status === "saving" && (
          <>
            <p className="text-2xl mb-3">✨</p>
            <p className="text-[#2C1A0E] font-medium">Saving connection...</p>
          </>
        )}
        {status === "done" && (
          <>
            <p className="text-2xl mb-3">✅</p>
            <p className="text-[#2C1A0E] font-medium">Apple Music connected!</p>
            <p className="text-sm text-[#6b5c4a]/70 mt-2">Returning to your practice...</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-2xl mb-3">😔</p>
            <p className="text-[#2C1A0E] font-medium">Something went wrong</p>
            <p className="text-sm text-red-600 mt-2">{error}</p>
            <button
              onClick={() => setLocation(returnTo, { replace: true })}
              className="mt-4 text-sm text-[#6B8F71] underline"
            >
              Go back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
