import { createContext, useContext } from "react";
import type { Role, User } from "./types";

const KEY = "acme-pay-token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
}

export const AUTH_EXPIRED_EVENT = "auth:expired";

interface AuthValue {
  user: User;
  signOut: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside the signed-in app");
  return v;
}

/** What each role may do. The server enforces the same rules; this only hides buttons that would be refused. */
export const can = {
  editData: (r: Role) => r === "hr",
  readPayroll: (r: Role) => r === "hr" || r === "owner",
  preparePayroll: (r: Role) => r === "hr",
  approvePayroll: (r: Role) => r === "owner",
};

export const ROLE_LABEL: Record<Role, string> = { hr: "HR manager", owner: "Owner", viewer: "Viewer" };
