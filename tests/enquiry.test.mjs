/**
 * Runs the enquiry Pages Function directly, with fetch (Resend) replaced by a recorder.
 *
 *   node --experimental-strip-types tests/enquiry.test.mjs [path to the previous enquiry.ts to compare against]
 *
 * Every invalid request must get the same answer as before and must never reach Resend.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const current = await import(pathToFileURL(path.resolve(import.meta.dirname, "..", "functions", "api", "enquiry.ts")).href);
const previous = process.argv[2] ? await import(pathToFileURL(path.resolve(process.argv[2])).href) : null;

const ENV = { RESEND_API_KEY: "test", ENQUIRY_TO: "to@example.com", ENQUIRY_FROM: "from@example.com" };
const ORIGIN = "https://site.test";
const valid = { name: "Sam", email: "sam@example.com", message: "Hello", piece: "the-yorkshire" };

let failures = 0;
function check(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${message}`);
  }
}

const realFetch = globalThis.fetch;
let resendCalls = [];
globalThis.fetch = async (url, init) => {
  resendCalls.push({ url: String(url), body: JSON.parse(init.body) });
  return new Response("{}", { status: 200 });
};

function post(body, headers = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`${ORIGIN}/api/enquiry`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers }, body: raw });
}

async function run(module, request) {
  resendCalls = [];
  const response = await module.onRequestPost({ request, env: ENV });
  return { status: response.status, body: await response.text(), calls: resendCalls.length };
}

const invalid = {
  "cross-origin": () => post(valid, { Origin: "https://evil.test" }),
  "no origin": () => new Request(`${ORIGIN}/api/enquiry`, { method: "POST", body: JSON.stringify(valid) }),
  "not JSON": () => post("{nope"),
  "array body": () => post("[]"),
  "missing name": () => post({ ...valid, name: "" }),
  "long name": () => post({ ...valid, name: "x".repeat(101) }),
  "bad email": () => post({ ...valid, email: "not-an-email" }),
  "empty message": () => post({ ...valid, message: "" }),
  "long message": () => post({ ...valid, message: "x".repeat(5001) }),
  "long piece": () => post({ ...valid, piece: "x".repeat(101) }),
  "too large": () => post({ ...valid, message: "x".repeat(40 * 1024) }),
  "honeypot": () => post({ ...valid, website: "bot" }),
  "long timber": () => post({ ...valid, timber: "x".repeat(101) }),
  "long size": () => post({ ...valid, size: "x".repeat(101) }),
  "long guide price": () => post({ ...valid, guidePrice: "x".repeat(41) }),
};

for (const [name, make] of Object.entries(invalid)) {
  const now = await run(current, make());
  check(now.calls === 0, `${name}: reached Resend`);
  check(now.status >= 200 && now.status < 500, `${name}: unexpected status ${now.status}`);
  if (previous && !name.startsWith("long timber") && !name.startsWith("long size") && !name.startsWith("long guide")) {
    const before = await run(previous, make());
    check(before.status === now.status && before.body === now.body, `${name}: answer changed (${before.status} ${before.body} -> ${now.status} ${now.body})`);
  }
}
for (const name of ["long timber", "long size", "long guide price"]) {
  const now = await run(current, invalid[name]());
  check(now.status === 400, `${name}: expected 400, got ${now.status}`);
}

const ok = await run(current, post({ ...valid, timber: "Recycled Messmate\r\nBcc: x@y.z", size: "2000 x 1000 mm", guidePrice: "$4,300" }));
check(ok.status === 200 && ok.calls === 1, "valid enquiry is sent once");
const text = resendCalls[0]?.body.text ?? "";
check(text.includes("Timber: Recycled Messmate Bcc: x@y.z\n"), "timber is one line");
check(text.includes("\nSize: 2000 x 1000 mm\n"), "size line");
check(text.includes("\nGuide price: $4,300\n"), "guide price line");
check(!text.split("\n").some((line) => line.startsWith("Bcc:")), "no injected header line");

const plain = await run(current, post(valid));
check(plain.status === 200 && !/Timber:|Size:|Guide price:/.test(resendCalls[0]?.body.text ?? ""), "no extra lines without a selection");

globalThis.fetch = realFetch;
console.log(failures === 0 ? "enquiry function: all checks passed" : `${failures} failures`);
process.exitCode = failures > 0 ? 1 : 0;
