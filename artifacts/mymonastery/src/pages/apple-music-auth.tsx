import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";

/**
 * Dedicated Apple Music auth page. Navigated to from moment-detail when user
 * taps "Connect Apple Music". Loads MusicKit, runs authorize(), saves token,
 * then navigates back. Works on iOS Safari where popups are blocked.
 */
export default function AppleMusicAuth() {
  const [status, setStatus] = useState<"loading" | "authorizing" | "saving" | "done" | "error">("loading");
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const returnTo = new URLSearchParams(search).get("returnTo") || "/moments";

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // 1. Load MusicKit JS
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

        // 2. Get developer token and configure
        const { token } = await apiRequest<{ token: string }>("GET", "/api/apple-music/developer-token");
        if (cancelled) return;

        const MK = w["MusicKit"] as {
          configure: (opts: object) => Promise<void>;
          getInstance: () => { authorize: () => Promise<string> };
        };
        await MK.configure({ developerToken: token, app: { name: "Eleanor", build: "1.0.0" } });
        if (cancelled) return;

        // 3. Authorize — this is the main page action, not a popup
        setStatus("authorizing");
        const musicUserToken = await MK.getInstance().authorize();
        if (cancelled) return;

        // 4. Save to backend
        setStatus("saving");
        await apiRequest("POST", "/api/apple-music/connect", { musicUserToken });
        if (cancelled) return;

        // 5. Navigate back
        setStatus("done");
        setTimeout(() => setLocation(returnTo, { replace: true }), 800);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Authorization failed");
          setStatus("error");
        }
      }
    }

    void run();
    return () => { cancelled = true; };
  }, [returnTo, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F0] px-6">
      <div className="text-center max-w-sm">
        {status === "loading" && (
          <>
            <p className="text-2xl mb-3">🎵</p>
            <p className="text-[#2C1A0E] font-medium">Loading Apple Music...</p>
          </>
        )}
        {status === "authorizing" && (
          <>
            <p className="text-2xl mb-3">🎵</p>
            <p className="text-[#2C1A0E] font-medium">Connecting to Apple Music...</p>
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
