/**
 * 路径约定。账号和个人档案在应用的档案目录（桌面端启动时经 CAMPUS_PROFILE_DIR 给出，
 * 默认 %APPDATA%/CampusAgent/profile）；所有可变数据在它旁边的 zju 目录下，可用 ZJU_DATA_DIR 覆盖。
 */
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function profileDir(): string {
  const given = process.env["CAMPUS_PROFILE_DIR"];
  if (given && given.trim()) return path.resolve(given);
  return path.join(process.env["APPDATA"] || path.join(os.homedir(), ".config"), "CampusAgent", "profile");
}

export function dataDir(): string {
  const override = process.env["ZJU_DATA_DIR"];
  return override && override.trim() ? path.resolve(override) : path.join(path.dirname(profileDir()), "zju");
}

export const paths = {
  root: ROOT,
  data: dataDir,
  sessions: () => path.join(dataDir(), "sessions"),
  session: (system: string) => path.join(dataDir(), "sessions", `${system}.json`),
  journal: () => path.join(dataDir(), "journal"),
  output: () => path.join(dataDir(), "output"),
  raw: () => path.join(dataDir(), "raw"),
  cache: () => path.join(dataDir(), "cache"),
  db: () => path.join(dataDir(), "zju.db"),
  envFile: () => path.join(ROOT, ".env"),
} as const;
