// SPEC: release-distribution (REL-11, REL-15)

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { patchManifest, pickAssetUrlByName, withReleaseTag } from "./patch-latest-json.mjs";

const scriptPath = fileURLToPath(new URL("./patch-latest-json.mjs", import.meta.url));

const DRAFT_ASSETS = [
  {
    name: "SwarmDeck_1.0.0_x64-portable.zip",
    url: "https://github.com/rafaelsene01/swarmdeck/releases/download/untagged-abc123/SwarmDeck_1.0.0_x64-portable.zip",
  },
  {
    name: "SwarmDeck_1.0.0_x64_en-US.msi",
    url: "https://github.com/rafaelsene01/swarmdeck/releases/download/untagged-abc123/SwarmDeck_1.0.0_x64_en-US.msi",
  },
];

test("pickAssetUrlByName finds the asset with the exact name", () => {
  const url = pickAssetUrlByName(DRAFT_ASSETS, "SwarmDeck_1.0.0_x64-portable.zip");
  assert.equal(
    url,
    "https://github.com/rafaelsene01/swarmdeck/releases/download/untagged-abc123/SwarmDeck_1.0.0_x64-portable.zip",
  );
});

test("pickAssetUrlByName fails explicitly when no asset matches", () => {
  assert.throws(() => pickAssetUrlByName(DRAFT_ASSETS, "does-not-exist.zip"), /no release asset named/);
});

test("withReleaseTag replaces the untagged ref, keeping owner, repo and filename", () => {
  const retagged = withReleaseTag(
    "https://github.com/rafaelsene01/swarmdeck/releases/download/untagged-abc123/SwarmDeck_1.0.0_x64-portable.zip",
    "v1.0.0",
  );
  assert.equal(
    retagged,
    "https://github.com/rafaelsene01/swarmdeck/releases/download/v1.0.0/SwarmDeck_1.0.0_x64-portable.zip",
  );
});

test("withReleaseTag rejects an empty or slash-containing tag", () => {
  const url = "https://github.com/rafaelsene01/swarmdeck/releases/download/untagged-abc123/file.zip";
  assert.throws(() => withReleaseTag(url, ""), /invalid tag/);
  assert.throws(() => withReleaseTag(url, "v1.0.0/extra"), /invalid tag/);
});

test("withReleaseTag rejects a URL that isn't a GitHub release download link", () => {
  assert.throws(
    () => withReleaseTag("https://example.com/not-a-release-asset", "v1.0.0"),
    /not a GitHub release download URL/,
  );
});

test("patchManifest adds the portable entry without touching existing platform keys", () => {
  const manifest = {
    version: "1.0.0",
    platforms: {
      "windows-x86_64": { signature: "sig-msi", url: "https://example.com/msi" },
    },
  };

  const patched = patchManifest({
    manifest,
    key: "windows-x86_64-portable",
    url: "https://github.com/rafaelsene01/swarmdeck/releases/download/v1.0.0/SwarmDeck_1.0.0_x64-portable.zip",
    signature: "sig-portable",
  });

  assert.deepEqual(patched.platforms["windows-x86_64"], { signature: "sig-msi", url: "https://example.com/msi" });
  assert.deepEqual(patched.platforms["windows-x86_64-portable"], {
    signature: "sig-portable",
    url: "https://github.com/rafaelsene01/swarmdeck/releases/download/v1.0.0/SwarmDeck_1.0.0_x64-portable.zip",
  });
});

test("patchManifest fails explicitly when the manifest has no platforms object", () => {
  assert.throws(
    () => patchManifest({ manifest: { version: "1.0.0" }, key: "k", url: "https://x", signature: "s" }),
    /has no `platforms` object/,
  );
});

test("CLI end-to-end: patches latest.json with the retagged portable entry", () => {
  const dir = mkdtempSync(join(tmpdir(), "swarmdeck-patch-manifest-"));
  const manifestPath = join(dir, "latest.json");
  const assetsPath = join(dir, "assets.json");
  const sigPath = join(dir, "SwarmDeck_1.0.0_x64-portable.zip.sig");

  writeFileSync(
    manifestPath,
    JSON.stringify({
      version: "1.0.0",
      platforms: { "windows-x86_64": { signature: "sig-msi", url: "https://example.com/msi" } },
    }),
  );
  writeFileSync(assetsPath, JSON.stringify(DRAFT_ASSETS));
  writeFileSync(sigPath, "sig-portable-content\n");

  execFileSync("node", [
    scriptPath,
    "--manifest",
    manifestPath,
    "--key",
    "windows-x86_64-portable",
    "--tag",
    "v1.0.0",
    "--assets",
    assetsPath,
    "--name",
    "SwarmDeck_1.0.0_x64-portable.zip",
    "--signature-file",
    sigPath,
  ]);

  const patched = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.deepEqual(patched.platforms["windows-x86_64-portable"], {
    signature: "sig-portable-content",
    url: "https://github.com/rafaelsene01/swarmdeck/releases/download/v1.0.0/SwarmDeck_1.0.0_x64-portable.zip",
  });
  assert.deepEqual(patched.platforms["windows-x86_64"], { signature: "sig-msi", url: "https://example.com/msi" });

  rmSync(dir, { recursive: true, force: true });
});
