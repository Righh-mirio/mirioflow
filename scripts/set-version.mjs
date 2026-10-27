// Usage: node scripts/set-version.mjs vMAJOR.MINOR.PATCH
// Writes the app version into the Node, Tauri and Cargo manifests and lockfiles.
// Values are replaced in place so each file keeps its formatting.
import { readFile, writeFile } from "node:fs/promises";

const tag = process.argv[2];
if (!tag || !/^v?\d+\.\d+\.\d+$/.test(tag)) {
  throw new Error("Usage: node scripts/set-version.mjs vMAJOR.MINOR.PATCH");
}
const version = tag.replace(/^v/, "");

const jsonVersion = /^(  "version":\s*")[^"]*(")/m;
const targets = [
  { file: "package.json", patterns: [jsonVersion] },
  {
    file: "package-lock.json",
    // Top-level version, then the root package entry (`"packages": { "": { ... } }`).
    patterns: [
      jsonVersion,
      /^(    "": \{\n(?:      .*\n)*?      "version":\s*")[^"]*(")/m,
    ],
  },
  { file: "src-tauri/tauri.conf.json", patterns: [jsonVersion] },
  {
    file: "src-tauri/Cargo.toml",
    patterns: [/^(\[package\]\n(?:.*\n)*?version = ")[^"]*(")/m],
  },
  {
    file: "src-tauri/Cargo.lock",
    patterns: [/^(name = "gladiaflow"\nversion = ")[^"]*(")/m],
  },
];

for (const { file, patterns } of targets) {
  let source = await readFile(file, "utf8");
  for (const pattern of patterns) {
    if (!pattern.test(source))
      throw new Error(`${file}: version not found (${pattern})`);
    source = source.replace(pattern, `$1${version}$2`);
  }
  await writeFile(file, source);
  console.log(`${file}: ${version}`);
}
