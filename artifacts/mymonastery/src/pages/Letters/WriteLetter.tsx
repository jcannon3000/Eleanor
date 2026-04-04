import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface MemberData {
  id: number;
  name: string | null;
  email: string;
  homeCity: string | null;
}

interface CorrespondenceBasic {
  id: number;
  name: string;
  startedAt: string;
  members: MemberData[];
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
  const [postmarkCity, setPostmarkCity] = useState("");
  const [postmarkError, setPostmarkError] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
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

  // Pre-fill postmark from member's homeCity
  useEffect(() => {
    if (!correspondence || !user || postmarkCity) return;
    const me = correspondence.members?.find((m) => m.email === user.email);
    if (me?.homeCity) {
      setPostmarkCity(me.homeCity);
    }
  }, [correspondence, user]);

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
        postmarkCity: postmarkCity.trim(),
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

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const canSend = wordCount >= 100 && wordCount <= 1000 && !sendMutation.isPending;

  function handleSendClick() {
    if (!postmarkCity.trim()) {
      setPostmarkError(true);
      return;
    }
    setPostmarkError(false);
    setConfirmSend(true);
  }

  // Back navigation with confirmation
  function handleBack() {
    if (content.trim() && content !== lastSavedRef.current) {
      saveDraft();
    }
    setLocation(`/letters/${correspondenceId}${tokenParam}`);
  }

  // Compute recipient names for salutation
  const userEmail = user?.email || "";
  const recipientNames = correspondence?.members
    ?.filter((m) => m.email !== userEmail)
    .map((m) => m.name || m.email.split("@")[0]) || [];
  const salutation = recipientNames.length <= 2
    ? recipientNames.join(" and ")
    : recipientNames.slice(0, -1).join(", ") + ", and " + recipientNames[recipientNames.length - 1];
  const authorName = user?.name || "You";

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
        <div className="w-8" />
      </div>

      {/* Action bar */}
      <div
        className="px-6 pb-3 border-b"
        style={{ borderColor: "#e8e2d9" }}
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
                className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors"
                style={{
                  borderColor: draftError ? "#C17F24" : showSaved ? "#6B8F71" : "#e8e2d9",
                  color: draftError ? "#C17F24" : showSaved ? "#6B8F71" : "#9a9390",
                }}
              >
                {draftError ? "Save failed" : showSaved ? "Saved \u2713" : "Save draft"}
              </button>
              <button
                onClick={handleSendClick}
                disabled={!canSend}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold transition-opacity disabled:opacity-40"
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

      {/* Writing area */}
      <div className="flex-1 px-6 pt-6">
        {/* Salutation (not editable) */}
        {salutation && (
          <p
            className="text-[19px] italic mb-4"
            style={{ color: "#6B8F71" }}
          >
            Dear {salutation},
          </p>
        )}

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

        {/* Signature (not editable) */}
        <p
          className="text-[19px] italic mt-4 mb-8"
          style={{ color: "#6B8F71" }}
        >
          &mdash; {authorName}
        </p>

        {/* Postmark field */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{"\u{1F4EE}"}</span>
            <span className="text-[13px]" style={{ color: "#9a9390" }}>Writing from:</span>
          </div>
          <input
            type="text"
            value={postmarkCity}
            onChange={(e) => {
              setPostmarkCity(e.target.value);
              if (e.target.value.trim()) setPostmarkError(false);
            }}
            placeholder="City (e.g. New York, London)"
            className="w-full px-3 py-2 rounded-lg bg-transparent text-[15px] focus:outline-none transition-colors"
            style={{
              color: "#2C1810",
              border: postmarkError ? "1px solid #C17F24" : "1px solid #e8e2d9",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          />
          {postmarkError && (
            <p className="text-[13px] mt-1" style={{ color: "#C17F24" }}>
              Where are you writing from? {"\u{1F33F}"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
