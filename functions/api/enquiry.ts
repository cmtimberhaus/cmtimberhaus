interface Env {
  RESEND_API_KEY?: string;
  ENQUIRY_TO?: string;
  ENQUIRY_FROM?: string;
}

interface RequestContext {
  request: Request;
  env: Env;
}

interface Enquiry {
  name: string;
  email: string;
  message: string;
  piece: string;
  honeypot: string;
}

const LIMITS = { name: 100, email: 254, message: 5000, piece: 100 } as const;
const MAX_BODY_BYTES = 32 * 1024;
const RESEND_TIMEOUT_MS = 10_000;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

// A single plain address: dot-atom local part, hostname-style domain with an alphabetic TLD.
// No display names, angle brackets, quotes, commas, whitespace or second "@".
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isPlainEmail(value: string): boolean {
  if (value.length > LIMITS.email) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return local.length <= 64 && LOCAL_PART.test(local) && DOMAIN.test(domain);
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

function parseEnquiry(payload: unknown): Enquiry | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  return {
    name: readString(source, "name"),
    email: readString(source, "email"),
    message: readString(source, "message"),
    piece: readString(source, "piece"),
    honeypot: readString(source, "website"),
  };
}

function validationError(enquiry: Enquiry): string | null {
  if (!enquiry.name || enquiry.name.length > LIMITS.name) return "Please enter your name.";
  if (!isPlainEmail(enquiry.email)) return "Please enter a valid email address.";
  if (!enquiry.message || enquiry.message.length > LIMITS.message) return "Please enter a message.";
  if (enquiry.piece.length > LIMITS.piece) return "Invalid request.";
  return null;
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return request.headers.get("Sec-Fetch-Site") === "same-origin";
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/** Reads the body as text, giving up as soon as it exceeds the cap. Returns null when too large. */
async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function onRequestPost({ request, env }: RequestContext): Promise<Response> {
  if (!isSameOrigin(request)) return jsonResponse(403, { error: "Forbidden." });

  const text = await readLimitedText(request, MAX_BODY_BYTES).catch(() => "");
  if (text === null) return jsonResponse(413, { error: "Request too large." });

  const enquiry = parseEnquiry(parseJson(text));
  if (!enquiry) return jsonResponse(400, { error: "Invalid request." });

  const problem = validationError(enquiry);
  if (problem) return jsonResponse(400, { error: problem });

  // Bots fill the hidden field. Report success so they do not retry.
  if (enquiry.honeypot) return jsonResponse(200, { ok: true });

  const { RESEND_API_KEY, ENQUIRY_TO, ENQUIRY_FROM } = env;
  if (!RESEND_API_KEY || !ENQUIRY_TO || !ENQUIRY_FROM) {
    console.error("Enquiry endpoint is missing RESEND_API_KEY, ENQUIRY_TO or ENQUIRY_FROM.");
    return jsonResponse(500, { error: "Enquiries are temporarily unavailable." });
  }

  const subjectSuffix = enquiry.piece ? ` about ${singleLine(enquiry.piece)}` : "";
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    body: JSON.stringify({
      from: ENQUIRY_FROM,
      to: [ENQUIRY_TO],
      reply_to: enquiry.email,
      subject: `Website enquiry from ${singleLine(enquiry.name)}${subjectSuffix}`,
      text: [
        `Name: ${enquiry.name}`,
        `Email: ${enquiry.email}`,
        enquiry.piece ? `Piece: ${enquiry.piece}` : null,
        "",
        enquiry.message,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    }),
  }).catch(() => null);

  if (!response || !response.ok) {
    console.error(`Resend request failed with status ${response ? response.status : "network error or timeout"}.`);
    return jsonResponse(502, { error: "We could not send your enquiry." });
  }

  return jsonResponse(200, { ok: true });
}

export function onRequest(): Response {
  const response = jsonResponse(405, { error: "Method not allowed." });
  response.headers.set("Allow", "POST");
  return response;
}
