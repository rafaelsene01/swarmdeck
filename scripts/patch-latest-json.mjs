#!/usr/bin/env node
// SPEC: release-distribution (REL-11, REL-15)
//
// Adds the portable entry to the updater manifest that tauri-action published.
//
// tauri-action only knows about the formats it bundles (nsis/msi/appimage/deb),
// so the portable zip has to be added afterwards. `platforms` is a plain map,
// so an extra key is inert for tauri-plugin-updater and readable by our own
// code. See .specs/features/release-distribution/design.md, component 5.
//
// Usage:
//   node scripts/patch-latest-json.mjs \
//     --manifest latest.json \
//     --key windows-x86_64-portable \
//     --tag v1.0.0 \
//     --signature-file SwarmDeck_1.0.0_x64-portable.zip.sig \
//     --assets assets.json --name SwarmDeck_1.0.0_x64-portable.zip

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Exact-name lookup of a release asset's download URL. Exact match rather
 * than substring: every archive name is also a prefix of its own `.sig`, so a
 * substring match against "…_x64-portable.zip" would always be ambiguous in
 * a real release.
 */
export function pickAssetUrlByName(assets, name) {
  if (!Array.isArray(assets)) throw new Error("assets must be an array");
  const hit = assets.find((asset) => String(asset?.name ?? "") === name);
  if (!hit) throw new Error(`no release asset named ${JSON.stringify(name)}`);
  const url = hit.url ?? hit.browser_download_url;
  if (!url) throw new Error(`asset ${name} has no download url`);
  return url;
}

/** `https://github.com/<owner>/<repo>/releases/download/<ref>/<file>` split so
 *  the ref can be replaced without touching owner, repo or filename. */
const DOWNLOAD_URL = /^(https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/)([^/]+)(\/[^/]+)$/;

/**
 * Rewrites the release ref of a GitHub download URL to `tag`.
 *
 * The portable zip is uploaded while the release is still a draft, and a
 * draft has no tag ref: GitHub serves its assets from an ephemeral
 * `/releases/download/untagged-<hash>/` path that stops existing the moment
 * the release is published. Reading that URL and writing it straight into
 * `latest.json` would publish a portable entry pointing at a dead link the
 * instant the release goes live — so the ref segment is corrected here,
 * preserving owner, repo and filename.
 */
export function withReleaseTag(url, tag) {
  const ref = String(tag ?? "");
  if (!ref || ref.includes("/")) throw new Error(`invalid tag: ${JSON.stringify(tag)}`);

  const parts = DOWNLOAD_URL.exec(String(url ?? ""));
  if (!parts) throw new Error(`not a GitHub release download URL: ${JSON.stringify(url)}`);

  return `${parts[1]}${ref}${parts[3]}`;
}

/**
 * Returns a copy of `manifest` with `platforms[key]` set to `{ url, signature }`,
 * without touching any other existing key.
 */
export function patchManifest({ manifest, key, url, signature }) {
  if (!manifest || typeof manifest !== "object") throw new Error("manifest must be an object");
  if (!manifest.platforms || typeof manifest.platforms !== "object") {
    throw new Error("manifest has no `platforms` object — is this a Tauri latest.json?");
  }
  if (!url) throw new Error("platform entry needs a url");
  if (!signature) throw new Error("platform entry needs a signature");

  return {
    ...manifest,
    platforms: { ...manifest.platforms, [key]: { signature, url } },
  };
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    flags[arg.slice(2)] = argv[++i];
  }
  return flags;
}

function main(argv) {
  const flags = parseArgs(argv);
  const manifestPath = flags.manifest ?? "latest.json";
  const key = flags.key ?? "windows-x86_64-portable";

  if (!flags["signature-file"]) throw new Error("--signature-file is required");
  const signature = readFileSync(flags["signature-file"], "utf8").trim();

  if (!flags.tag) throw new Error("--tag is required");
  if (!flags.assets || !flags.name) throw new Error("--assets and --name are required");

  const assets = JSON.parse(readFileSync(flags.assets, "utf8"));
  const url = withReleaseTag(pickAssetUrlByName(assets, flags.name), flags.tag);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const patched = patchManifest({ manifest, key, url, signature });
  writeFileSync(manifestPath, `${JSON.stringify(patched, null, 2)}\n`);

  process.stdout.write(`${key} -> ${url}\n`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
