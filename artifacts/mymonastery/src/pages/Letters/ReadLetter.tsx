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
  sentAt: string;
  readBy: Array<string | number>;
}

interface CorrespondenceDetail {
  id: number;
  name: string;
  letters: LetterData[];
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

export default function ReadLetter() {
  const [, params] = useRoute("/letters/:id/read/:letterId");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const correspondenceId = params?.id;
  const letterId = params?.letterId;
  const token = new URLSearchParams(window.location.search).get("token");
  const tokenParam = token ? `?token=${token}` : "";

  const { data } = useQuery<CorrespondenceDetail>({
    queryKey: [`/api/letters/correspondences/${correspondenceId}`],
    queryFn: () =>
      apiRequest("GET", `/api/letters/correspondences/${correspondenceId}${tokenParam}`),
    enabled: !!correspondenceId && (!!user || !!token),
  });

  const letter = data?.letters?.find((l) => l.id === Number(letterId));
  const userEmail = user?.email || "";
  const isOwnLetter = letter?.authorEmail === userEmail;
  const hasWrittenThisPeriod = data?.currentPeriod?.hasWrittenThisPeriod ?? false;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (!letter) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF6F0" }}>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const backUrl = `/letters/${correspondenceId}${tokenParam}`;
  const writeUrl = `/letters/${correspondenceId}/write${tokenParam}`;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF6F0" }}>
      {/* Header */}
      <div className="px-6 pt-8 pb-4 max-w-[600px] mx-auto">
        <Link
          href={backUrl}
          className="text-sm text-muted-foreground hover:text-[#2C1810] transition-colors"
        >
          &larr;
        </Link>
      </div>

      {/* Letter */}
      <div className="max-w-[600px] mx-auto px-6 pb-16" style={{ paddingTop: "48px" }}>
        <p
          className="text-[11px] font-semibold uppercase mb-8"
          style={{ color: "#4A6FA5", letterSpacing: "0.1em" }}
        >
          {letter.authorName} · {formatLetterDate(letter.sentAt)}
        </p>

        <div
          className="whitespace-pre-wrap"
          style={{
            color: "#2C1810",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "19px",
            lineHeight: "2.1",
          }}
        >
          {letter.content}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t" style={{ borderColor: "#e8e2d9" }}>
          <p className="text-xs text-muted-foreground">
            Received {formatLetterDate(letter.sentAt)}
          </p>

          {!isOwnLetter && !hasWrittenThisPeriod && (
            <Link href={writeUrl}>
              <button
                className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm"
                style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
              >
                Write your letter
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
