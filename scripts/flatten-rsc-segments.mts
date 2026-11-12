/**
 * Postbuild step for `output: "export"`.
 *
 * Next 16 writes segment prefetch payloads into nested folders
 * (out/dining/__next.$d$category/__PAGE__.txt) but the client router requests
 * a flat, dot-joined name (out/dining/__next.$d$category.__PAGE__.txt).
 * This copies every nested payload to the flat name and keeps the originals.
 * See the README ("RSC prefetch workaround") for background and removal notes.
 */
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT_DIR = join(import.meta.dirname, "..", "out");
const SEGMENT_DIR_PREFIX = "__next.";

/** Returns every file below `dir`, as absolute paths. */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

/** Each `__next.*` folder is flattened into a sibling file named with dots. */
function flatTarget(file: string): string | null {
  const parts = relative(OUT_DIR, file).split(sep);
  const segmentIndex = parts.findIndex(
    (part, i) => i < parts.length - 1 && part.startsWith(SEGMENT_DIR_PREFIX),
  );
  if (segmentIndex === -1) return null;

  const parent = parts.slice(0, segmentIndex);
  const flatName = parts.slice(segmentIndex).join(".");
  return join(OUT_DIR, ...parent, flatName);
}

function main(): void {
  if (!existsSync(OUT_DIR)) {
    throw new Error(`${OUT_DIR} not found. Run \`next build\` first.`);
  }

  let copied = 0;
  for (const file of listFiles(OUT_DIR)) {
    const target = flatTarget(file);
    if (target === null) continue;
    copyFileSync(file, target);
    copied += 1;
  }
  console.log(`flatten-rsc-segments: wrote ${copied} flat payload copies`);
}

main();
