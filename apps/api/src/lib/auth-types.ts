import type { Role } from "@sigap/core";

export interface AuthUser {
  id: string;
  sessionId: string;
  username: string | null;
  name: string;
  role: Role;
  unitId: string;
  regionId: string | null;
  totpEnabled: boolean;
}
