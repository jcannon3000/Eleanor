import { useEffect } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface LetterData {
  id: number;
  correspondenceId: number;
  authorUserId: number | null;
  authorEmail: string;
  authorName: string;
  content: string;
  letterNumber: number;
  periodNumber: number;
  periodStartDate: string;
  postmarkCity: string | null;
  postmarkCountry: string | null;
  sentAt: string;
  readBy: Array<string | number>;
}

interface CorrespondenceDetail {
  id: number;
  name: string;
  groupType: string;
  members: Array<{
    id: number;
    name: string | null;
    email: string;
  }>;
  letters: LetterData[];
  myTurn: boolean;
  currentPeriod: {
    hasWrittenThisPeriod: boolean;
    periodNumber: number;
    periodLabel: string;
  };
}

function formatLetterDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export default function ReadLetter() {
  const [, params] = useRoute("/letters/:id/read/:letterId");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const correspondenceId = params?.id;
  const letterId = params?.letterId;
  const token = new URLSearchParams(window.location.search).get("token");
  const tokenParam = token ? `?token=${token}` : "";

  const { data } = useQuery<CorrespondenceDetail>({
    queryKey: [`/api/phoebe/correspondences/${correspondenceId}`],
    queryFn: async () => {
      try {
        return await apiRequest("GET", `/api/phoebe/correspondences/${correspondenceId}${tokenParam}`);
      } catch {
        return await apiRequest("GET", `/api/letters/correspondences/${correspondenceId}${tokenParam}`);
      }
    },
    enabled: !!correspondenceId && (!!user || !!token),
  });

  const letter = data?.letters?.find((l) => l.id === Number(letterId));
  const userEmail = user?.email || "";
  const isOwnLetter = letter?.authorEmail === userEmail;
  const isOneToOne = data?.groupType === "one_to_one";
  const hasWrittenThisPeriod = data?.currentPeriod?.hasWrittenThisPeriod ?? false;
  const myTurn = data?.myTurn ?? false;

  const otherMembers = data?.members
    .filter((m) => m.email !== userEmail)
    .map((m) => m.name || m.email.split("@")[0])
    .join(", ") ?? "";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (!letter) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF6F0" }}>
        <p style={{ color: "#9a9390" }}>Loading...</p>
      </div>
    );
  }

  const backUrl = `/letters/${correspondenceId}${tokenParam}`;
  const writeUrl = `/letters/${correspondenceId}/write${tokenParam}`;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF6F0" }}>
      {/* Header */}
      <div className="px-6 pt-8 pb-4 max-w-[600px] mx-auto">
        <button
          onClick={() => setLocation(backUrl)}
          className="text-sm"
          style={{ color: "#9a9390" }}
        >
          ← Back
        </button>
      </div>

      {/* Letter paper */}
      <div
        className="max-w-[560px] mx-auto relative"
        style={{
          backgroundColor: "#FAF6F0",
          boxShadow: "inset 0 0 0 1px rgba(74,111,165,0.1), 0 4px 24px rgba(44,24,16,0.08)",
          padding: "48px 32px",
          borderRadius: "2px",
          marginLeft: "auto",
          marginRight: "auto",
          marginTop: "16px",
        }}
      >
        {/* Postmark stamp — top right */}
        {letter.postmarkCity && isOneToOne && (
          <div
            className="absolute flex flex-col items-center justify-center"
            style={{
              top: "20px",
              right: "20px",
              border: "1.5px solid #4A6FA5",
              borderRadius: "50% / 40%",
              padding: "10px 16px",
              transform: "rotate(-8deg)",
              minWidth: "80px",
            }}
          >
            <span
              className="font-semibold uppercase"
              style={{ color: "#4A6FA5", fontSize: "11px", letterSpacing: "0.08em", lineHeight: 1.3 }}
            >
              {letter.postmarkCity}
            </span>
            <span style={{ color: "#4A6FA5", fontSize: "10px", lineHeight: 1.3 }}>
              {formatShortDate(letter.sentAt)}
            </span>
          </div>
        )}

        {/* Letter metadata */}
        <p
          className="text-[11px] font-semibold uppercase mb-8 pr-24"
          style={{ color: "#9a9390", letterSpacing: "0.1em" }}
        >
          {letter.authorName}
          {" · "}
          {isOneToOne ? `Letter ${letter.letterNumber}` : `Update ${letter.letterNumber}`}
          {letter.postmarkCity ? ` · ${letter.postmarkCity}` : ""}
          {" · "}
          {formatLetterDate(letter.sentAt)}
        </p>

        {/* Salutation */}
        {isOneToOne && (
          <p className="text-base italic mb-6" style={{ color: "#9a9390", fontFamily: "Georgia, serif" }}>
            Dear {isOwnLetter ? otherMembers : (user?.name || "Friend")},
          </p>
        )}

        {/* Letter body */}
        <div
          className="whitespace-pre-wrap"
          style={{
            color: "#2C1810",
            fontFamily: isOneToOne ? "Georgia, serif" : "'Space Grotesk', sans-serif",
            fontSize: "19px",
            lineHeight: "2.1",
          }}
        >
          {letter.content}
        </div>

        {/* Signature */}
        {isOneToOne && (
          <p className="text-base italic mt-6" style={{ color: "#9a9390", fontFamily: "Georgia, serif" }}>
            — {letter.authorName}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-[560px] mx-auto px-6 pt-8 pb-16 text-center">
        <p className="text-[13px]" style={{ color: "#9a9390" }}>
          {formatLetterDate(letter.sentAt)}
          {letter.postmarkCity ? ` · ${letter.postmarkCity}` : ""}
        </p>

        {/* Write back prompt */}
        {!isOwnLetter && myTurn && !hasWrittenThisPeriod && (
          <div className="mt-8">
            <p className="text-[15px] italic mb-4" style={{ color: "#4A6FA5" }}>
              {isOneToOne ? "Your turn to write. 📮" : "Share your update. 📮"}
            </p>
            <button
              onClick={() => setLocation(writeUrl)}
              className="px-6 py-3 rounded-xl font-semibold text-sm"
              style={{ backgroundColor: "#4A6FA5", color: "#fff" }}
            >
              {isOneToOne ? "Write your letter 📮" : "Share your update 📮"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
