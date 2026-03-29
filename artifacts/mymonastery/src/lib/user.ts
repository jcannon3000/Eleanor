const USER_KEY = "monastery_user";

export interface LocalUser {
  id: number;
  name: string;
  email: string;
}

export function getLocalUser(): LocalUser | null {
  try {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function setLocalUser(user: LocalUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearLocalUser() {
  localStorage.removeItem(USER_KEY);
}
