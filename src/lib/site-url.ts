const PLACEHOLDER_HOSTS = ["example.com", "example.org", "example.net"];

function isPlaceholderHost(hostname: string): boolean {
  return PLACEHOLDER_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    throw new Error("NEXT_PUBLIC_SITE_URL is not set. See .env.example.");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_SITE_URL is not a valid URL: "${raw}".`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must start with https:// or http://.");
  }
  if (isPlaceholderHost(parsed.hostname)) {
    throw new Error(`NEXT_PUBLIC_SITE_URL uses a placeholder host (${parsed.hostname}). Set the real site address.`);
  }
  return raw.replace(/\/+$/, "");
}
