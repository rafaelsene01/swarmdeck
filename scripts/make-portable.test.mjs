// SPEC: release-distribution (REL-14, REL-18)

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PORTABLE_MARKER, portableArchiveName, portableReadme, stageBundle } from "./make-portable.mjs";

const scriptPath = fileURLToPath(new URL("./make-portable.mjs", import.meta.url));

test("portableArchiveName names the zip after the app and version", () => {
  assert.equal(portableArchiveName("0.1.1"), "SwarmDeck_0.1.1_x64-portable.zip");
});

test("portableArchiveName fails explicitly on a version outside X.Y.Z", () => {
  assert.throws(() => portableArchiveName("0.1"), /invalid version/);
});

test("an invalid --version is rejected before any file or directory is created", () => {
  const outDir = join(mkdtempSync(join(tmpdir(), "swarmdeck-portable-")), "out");

  assert.throws(() => {
    execFileSync("node", [scriptPath, "--version", "not-a-version", "--out", outDir], { stdio: "pipe" });
  });

  assert.equal(existsSync(outDir), false, "an invalid version must not create the --out directory");
});

test("stageBundle lays out the renamed executable and the portable marker", () => {
  const dir = mkdtempSync(join(tmpdir(), "swarmdeck-portable-"));
  const binary = join(dir, "swarmdeck.exe");
  writeFileSync(binary, "fake binary");
  const appDir = join(dir, "staged");

  stageBundle({ appDir, binary, resources: join(dir, "does-not-exist"), version: "0.1.1" });

  assert.equal(existsSync(join(appDir, "SwarmDeck.exe")), true);
  assert.equal(existsSync(join(appDir, PORTABLE_MARKER)), true);

  rmSync(dir, { recursive: true, force: true });
});

test("stageBundle copies the resources directory only when it is given and exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "swarmdeck-portable-"));
  const binary = join(dir, "swarmdeck.exe");
  writeFileSync(binary, "fake binary");
  const resources = join(dir, "resources");
  mkdirSync(resources, { recursive: true });
  writeFileSync(join(resources, "marker.txt"), "vendored resource");

  const appDirWith = join(dir, "staged-with");
  stageBundle({ appDir: appDirWith, binary, resources, version: "0.1.1" });
  assert.equal(existsSync(join(appDirWith, "resources", "marker.txt")), true);

  const appDirWithout = join(dir, "staged-without");
  stageBundle({ appDir: appDirWithout, binary, resources: join(dir, "no-such-dir"), version: "0.1.1" });
  assert.equal(existsSync(join(appDirWithout, "resources")), false);

  rmSync(dir, { recursive: true, force: true });
});

test("the LEIA-ME explains that deleting the marker takes the app out of portable mode", () => {
  const readme = portableReadme("0.1.1");
  assert.match(readme, new RegExp(`Não apague o arquivo ${PORTABLE_MARKER.replace(".", "\\.")}`));
  assert.match(readme, /mantém o app em modo\s*\n?portátil/);
});
