import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface CorrespondenceBasic {
  id: number;
  name: string;
  startedAt: string;
  currentPeriod: {
    periodNumber: number;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
  };
}

interface DraftData {
  content: string;
  lastSavedAt: string;
}

export default function WriteLetter() {
  const [, params] = useRoute("/letters/:id/write");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const correspondenceId = params?.id;
  const token = new URLSearchParams(window.location.search).get("token");
  const tokenParam = token ? `?token=${token}` : "";

  const [content, setContent] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [toast, setToast] = useState("");
  const [errorState, setErrorState] = useState<{ message: string; nextPeriodStart?: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedRef = useRef("");

  // Fetch correspondence details
  const { data: correspondence } = useQuery<CorrespondenceBasic>({
    queryKey: [`/api/letters/correspondences/${correspondenceId}`],
    queryFn: () => apiRequest("GET", `/api/letters/correspondences/${correspondenceId}${tokenParam}`),
    enabled: !!correspondenceId && (!!user || !!token),
  });

  // Load draft
  const { data: draft } = useQuery<DraftData | null>({
    queryKey: [`/api/letters/correspondences/${correspondenceId}/draft`],
    queryFn: () => apiRequest("GET", `/api/letters/correspondences/${correspondenceId}/draft${tokenParam}`),
    enabled: !!correspondenceId && (!!user || !!token),
  });

  // Populate from draft on load
  useEffect(() => {
    if (draft?.content && !content) {
      setContent(draft.content);
      lastSavedRef.current = draft.content;
    }
  }, [draft]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [content]);

  // Save draft
  const [draftError, setDraftError] = useState(false);

  const saveDraft = useCallback(async () => {
    if (!correspondenceId || content === lastSavedRef.current) return;
    try {
      await apiRequest("PUT", `/api/letters/correspondences/${correspondenceId}/draft${tokenParam}`, { content });
      lastSavedRef.current = content;
      setDraftError(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (err) {
      console.error("Draft save failed:", err);
      setDraftError(true);
    }
  }, [correspondenceId, content, tokenParam]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    saveTimerRef.current = setInterval(saveDraft, 30000);
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    };
  }, [saveDraft]);

  // Save on unmount
  useEffect(() => {
    return () => { saveDraft(); };
  }, [saveDraft]);

  // Send letter
  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/letters/correspondences/${correspondenceId}/letters${tokenParam}`, {
        content: content.trim(),
      }),
    onSuccess: () => {
      setLocation(`/letters/${correspondenceId}${tokenParam}`);
    },
    onError: (err: Error) => {
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.error === "already_written_this_period") {
          setErrorState({
            message: "Your letter for this period has already been sent.",
            nextPeriodStart: parsed.nextPeriodStart,
          });
        } else {
          setErrorState({ message: "Something went wrong. Tap to try again." });
        }
      } catch {
        setErrorState({ message: "Something went wrong. Tap to try again." });
      }
      setConfirmSend(false);
    },
  });

  // Polish letter with undo/redo
  const [isPolishing, setIsPolishing] = useState(false);
  const [originalBeforePolish, setOriginalBeforePolish] = useState<string | null>(null);
  const [cachedPolished, setCachedPolished] = useState<string | null>(null);
  const [polishState, setPolishState] = useState<"idle" | "polished" | "undone">("idle");

  async function handlePolish() {
    // Redo: if undone and content matches original, swap back without API call
    if (polishState === "undone" && cachedPolished && content === originalBeforePolish) {
      setContent(cachedPolished);
      setPolishState("polished");
      return;
    }

    if (!content.trim() || isPolishing) return;
    setIsPolishing(true);
    try {
      const recipientName = correspondence?.name?.replace("Letters with ", "") || undefined;
      const result = await apiRequest<{ polished: string }>(
        "POST",
        `/api/letters/polish${tokenParam}`,
        { content: content.trim(), recipientName },
      );
      if (result.polished) {
        setOriginalBeforePolish(content);
        setCachedPolished(result.polished);
        setContent(result.polished);
        setPolishState("polished");
      }
    } catch (err: unknown) {
      console.error("Polish failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Polish failed: ${msg}`);
    } finally {
      setIsPolishing(false);
    }
  }

  function handleUndoPolish() {
    if (originalBeforePolish !== null) {
      setContent(originalBeforePolish);
      setPolishState("undone");
    }
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const canSend = wordCount >= 100 && wordCount <= 1000 && !sendMutation.isPending;

  // Back navigation with confirmation
  function handleBack() {
    if (content.trim() && content !== lastSavedRef.current) {
      saveDraft();
    }
    setLocation(`/letters/${correspondenceId}${tokenParam}`);
  }

  if (errorState) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ backgroundColor: "#FAF6F0" }}
      >
        <p className="text-base mb-2" style={{ color: "#2C1810" }}>
          {errorState.message}
        </p>
        {errorState.nextPeriodStart && (
          <p className="text-sm text-muted-foreground mb-6">
            You can write again on {errorState.nextPeriodStart}.
          </p>
        )}
        <button
          onClick={() => setLocation(`/letters/${correspondenceId}${tokenParam}`)}
          className="text-sm font-medium"
          style={{ color: "#4A6FA5" }}
        >
          &larr; Back to letters
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#FAF6F0" }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-2 flex items-center justify-between">
        <button onClick={handleBack} className="text-sm text-muted-foreground hover:text-[#2C1810] transition-colors">
          &larr;
        </button>
        <div className="text-center">
          <p className="text-[13px] text-muted-foreground">{correspondence?.name}</p>
          {correspondence?.currentPeriod && (
            <p className="text-[13px]" style={{ color: "#4A6FA5" }}>
              Letter {correspondence.currentPeriod.periodNumber} · {correspondence.currentPeriod.periodLabel}
            </p>
          )}
        </div>
        {/* Word count indicator */}
        <div className="w-20 text-right">
          {wordCount > 0 && (
            <span
              className="text-xs"
              style={{
                color: wordCount < 100 ? "#9a9390" : wordCount > 1000 ? "#C17F24" : "#6B8F71",
              }}
            >
              {wordCount} / 1000
            </span>
          )}
        </div>
      </div>

      {/* Polish bar */}
      {wordCount >= 20 && (
        <div className="px-6 pb-3 flex items-center gap-2">
          {polishState === "polished" && (
            <button
              onClick={handleUndoPolish}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: "#9a9390" }}
            >
              Undo polish
            </button>
          )}
          <button
            onClick={handlePolish}
            disabled={isPolishing}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
            style={{
              borderColor: polishState === "polished" ? "#6B8F71" : "#4A6FA5",
              color: isPolishing ? "#9a9390" : polishState === "polished" ? "#6B8F71" : "#4A6FA5",
            }}
          >
            {isPolishing ? "Polishing..." : polishState === "undone" ? "Redo polish" : polishState === "polished" ? "Polished \u2713" : "Polish \u2728"}
          </button>
        </div>
      )}

      {/* Writing area */}
      <div className="flex-1 px-6 relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setConfirmSend(false);
          }}
          placeholder={`What's been on your mind these past two weeks?\n\nWhat happened that you want them to know?\n\nWhat are you looking forward to?\nWhat are you carrying?\nWhat made you laugh?\n\nWrite as long or as short as feels right.`}
          className="w-full min-h-[50vh] bg-transparent resize-none focus:outline-none placeholder:italic"
          style={{
            color: "#2C1810",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "18px",
            lineHeight: "2.0",
            caretColor: "#4A6FA5",
          }}
        />

        {/* Saved indicator */}
        {showSaved && (
          <div className="fixed bottom-24 right-6 text-xs" style={{ color: "#6B8F71" }}>
            Saved
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div
        className="sticky bottom-0 px-6 py-4 border-t"
        style={{ borderColor: "#e8e2d9", backgroundColor: "#FAF6F0" }}
      >
        {!confirmSend ? (
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: wordCount < 100 ? "#9a9390" : wordCount > 1000 ? "#C17F24" : "#6B8F71" }}>
              {wordCount} word{wordCount !== 1 ? "s" : ""}
              {wordCount > 0 && wordCount < 100 && <span className="text-muted-foreground"> · {100 - wordCount} to go</span>}
              {wordCount > 1000 && <span> · {wordCount - 1000} over</span>}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { saveDraft(); }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors"
                style={{
                  borderColor: draftError ? "#C17F24" : showSaved ? "#6B8F71" : "#e8e2d9",
                  color: draftError ? "#C17F24" : showSaved ? "#6B8F71" : "#9a9390",
                }}
              >
                {draftError ? "Save failed" : showSaved ? "Saved \u2713" : "Save draft"}
              </button>
              <button
                onClick={() => setConfirmSend(true)}
                disabled={!canSend}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
              >
                Send letter
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Send your letter? Once sent, it can't be edited.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
              >
                {sendMutation.isPending ? "Sending..." : "Send"}
              </button>
              <button
                onClick={() => setConfirmSend(false)}
                className="text-sm text-muted-foreground hover:text-[#2C1810]"
              >
                Keep writing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
