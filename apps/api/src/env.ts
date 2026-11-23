import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

export function loadEnv(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../../../.env")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      loadEnvFile(candidate);
      return;
    }
  }
}
