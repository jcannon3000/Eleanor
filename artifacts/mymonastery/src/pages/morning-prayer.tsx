import { useParams, useLocation } from "wouter";
import { MorningPrayerSlideshow } from "@/components/MorningPrayer/MorningPrayerSlideshow";

export default function MorningPrayerPage() {
  const params = useParams<{ momentId: string; token: string }>();
  const [, setLocation] = useLocation();

  const momentId = parseInt(params.momentId ?? "0", 10);
  const memberToken = params.token ?? "";

  if (!momentId || !memberToken) {
    setLocation("/moments");
    return null;
  }

  return (
    <MorningPrayerSlideshow
      momentId={momentId}
      memberToken={memberToken}
      onBack={() => setLocation(`/moments/${momentId}`)}
    />
  );
}
