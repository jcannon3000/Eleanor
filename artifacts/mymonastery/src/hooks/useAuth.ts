import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  googleId: string | null;
}

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to fetch user");
  return res.json();
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return { user: user ?? null, isLoading };
}

export function useLogout() {
  const queryClient = useQueryClient();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    queryClient.setQueryData(["/api/auth/me"], null);
    queryClient.clear();
    window.location.href = "/";
  };
}
