import { DEFAULT_SETTINGS, normalizeSettings, type AssistantSettings } from "./model";

const FILE_PATH = "data/settings.json";
const REPO = "moha700m/noora-live";
const TTL_MS = 10_000;

let cache: { at: number; settings: AssistantSettings } | null = null;

function githubToken(): string | undefined {
  const value = process.env.SETTINGS_GITHUB_TOKEN?.trim();
  if (!value || value === "undefined") return undefined;
  return value;
}

export function canSaveSettings(): boolean {
  return Boolean(githubToken());
}

export function rememberSettings(settings: AssistantSettings): void {
  cache = { at: Date.now(), settings };
}

export async function loadSettings(): Promise<AssistantSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.settings;
  try {
    const response = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${FILE_PATH}`, {
      cache: "no-store",
      headers: { accept: "application/json", "user-agent": "noora" },
    });
    if (!response.ok) return cache?.settings ?? DEFAULT_SETTINGS;
    const settings = normalizeSettings(await response.json());
    rememberSettings(settings);
    return settings;
  } catch {
    return cache?.settings ?? DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AssistantSettings): Promise<"saved" | "no_token" | "failed"> {
  const token = githubToken();
  if (!token) return "no_token";
  const normalized = normalizeSettings(settings);
  const api = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": "noora-admin",
    "x-github-api-version": "2022-11-28",
  };
  const current = await fetch(`${api}?ref=main`, { headers, cache: "no-store" });
  if (!current.ok) return "failed";
  const meta = (await current.json()) as { sha?: string };
  if (!meta.sha) return "failed";
  const body = `${JSON.stringify(normalized, null, 2)}\n`;
  const saved = await fetch(api, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: "Update Noora assistant settings",
      content: Buffer.from(body).toString("base64"),
      sha: meta.sha,
      branch: "main",
    }),
  });
  if (!saved.ok) return "failed";
  rememberSettings(normalized);
  return "saved";
}
