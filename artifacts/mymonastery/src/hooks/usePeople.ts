import { useQuery } from "@tanstack/react-query";

export interface PersonSummary {
  name: string;
  email: string;
  sharedCircleCount: number;
  firstCircleDate: string;
}

export interface SharedMeetup {
  id: number;
  ritualId: number;
  scheduledDate: string;
  status: "planned" | "completed" | "skipped";
  notes: string | null;
  createdAt: string;
}

export interface SharedRitual {
  ritual: {
    id: number;
    name: string;
    frequency: string;
    dayPreference: string | null;
    intention: string | null;
    participants: Array<{ name: string; email: string }>;
    ownerId: number;
    createdAt: string;
    streak: number;
    nextMeetupDate: string | null;
    lastMeetupDate: string | null;
    status: "on_track" | "overdue" | "needs_scheduling";
  };
  meetups: SharedMeetup[];
}

export interface SharedPractice {
  id: number;
  name: string;
  currentStreak: number;
  totalBlooms: number;
  frequency: string;
  templateType: string | null;
  createdAt: string;
}

export interface PersonProfile {
  name: string;
  email: string;
  stats: {
    sharedCircleCount: number;
    totalGatherings: number;
    firstCircleDate: string | null;
  };
  sharedRituals: SharedRitual[];
  sharedPractices: SharedPractice[];
}

export function usePeople(ownerId: number | undefined) {
  return useQuery<PersonSummary[]>({
    queryKey: ["/api/people", ownerId],
    queryFn: async () => {
      if (!ownerId) return [];
      const res = await fetch(`/api/people?ownerId=${ownerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch people");
      return res.json();
    },
    enabled: !!ownerId,
    staleTime: 2 * 60 * 1000,
  });
}

export function usePersonProfile(email: string | undefined, ownerId: number | undefined) {
  return useQuery<PersonProfile>({
    queryKey: ["/api/people", email, ownerId],
    queryFn: async () => {
      if (!email || !ownerId) throw new Error("Missing params");
      const res = await fetch(
        `/api/people/${encodeURIComponent(email)}?ownerId=${ownerId}`,
        { credentials: "include" }
      );
      if (res.status === 404) throw new Error("Not found");
      if (!res.ok) throw new Error("Failed to fetch person");
      return res.json();
    },
    enabled: !!email && !!ownerId,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}
