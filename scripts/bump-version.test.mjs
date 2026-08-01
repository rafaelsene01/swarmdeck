// SPEC: release-distribution (REL-03, REL-04, REL-30)

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { bumpVersion, resolveVersion, setJsonVersion, setWorkspaceVersion } from "./bump-version.mjs";

const scriptPath = fileURLToPath(new URL("./bump-version.mjs", import.meta.url));

test("bumpVersion increments the patch segment", () => {
  assert.equal(bumpVersion("0.1.0", "patch"), "0.1.1");
});

test("bumpVersion increments the minor segment and resets patch", () => {
  assert.equal(bumpVersion("0.1.5", "minor"), "0.2.0");
});

test("bumpVersion increments the major segment and resets minor and patch", () => {
  assert.equal(bumpVersion("0.1.5", "major"), "1.0.0");
});

test("bumpVersion fails explicitly on an unknown increment kind", () => {
  assert.throws(() => bumpVersion("0.1.0", "epic"), /unknown bump kind/);
});

test("bumpVersion fails explicitly on a base version outside X.Y.Z", () => {
  assert.throws(() => bumpVersion("0.1", "patch"), /invalid version/);
});

test("resolveVersion bumps from --base when the target is a kind", () => {
  assert.equal(resolveVersion("patch", "0.1.0"), "0.1.1");
});

test("setWorkspaceVersion rewrites only the version inside [workspace.package]", () => {
  const source = [
    "[workspace]",
    'members = ["src-tauri"]',
    "",
    "[workspace.package]",
    'version = "0.1.0"',
    'edition = "2021"',
    "",
    "[workspace.dependencies]",
    'serde = { version = "1", features = ["derive"] }',
    'uuid = { version = "1", features = ["v7", "serde"] }',
    "",
  ].join("\n");

  const result = setWorkspaceVersion(source, "0.2.0");

  assert.match(result, /\[workspace\.package\][\s\S]*?version = "0\.2\.0"/);
  assert.match(result, /serde = \{ version = "1", features = \["derive"\] \}/);
  assert.match(result, /uuid = \{ version = "1", features = \["v7", "serde"\] \}/);
});

test("setWorkspaceVersion leaves a version key in another section intact", () => {
  const source = [
    "[workspace]",
    'members = ["src-tauri"]',
    "",
    "[workspace.package]",
    'version = "0.1.0"',
    'edition = "2021"',
    "",
    "[package]",
    'name = "swarmdeck-mcp"',
    'version = "9.9.9"',
    "",
  ].join("\n");

  const result = setWorkspaceVersion(source, "0.2.0");

  assert.match(result, /\[workspace\.package\][\s\S]*?version = "0\.2\.0"/);
  assert.match(result, /\[package\][\s\S]*?version = "9\.9\.9"/);
});

test("setWorkspaceVersion fails explicitly when [workspace.package] has no version key", () => {
  const source = ["[workspace]", 'members = ["src-tauri"]', "", "[workspace.package]", 'edition = "2021"'].join(
    "\n",
  );

  assert.throws(() => setWorkspaceVersion(source, "0.2.0"), /no "version" key/);
});

test("setJsonVersion updates package.json's version and package-lock.json's packages[\"\"].version", () => {
  const packageJson = JSON.stringify({ name: "swarmdeck", version: "0.1.0" });
  const packageLock = JSON.stringify({
    name: "swarmdeck",
    version: "0.1.0",
    packages: { "": { name: "swarmdeck", version: "0.1.0" } },
  });

  const patchedPackageJson = JSON.parse(setJsonVersion(packageJson, "0.2.0"));
  const patchedPackageLock = JSON.parse(setJsonVersion(packageLock, "0.2.0"));

  assert.equal(patchedPackageJson.version, "0.2.0");
  assert.equal(patchedPackageLock.version, "0.2.0");
  assert.equal(patchedPackageLock.packages[""].version, "0.2.0");
});

test("--dry-run prints only the resolved version and writes no file", () => {
  const before = {
    packageJson: execFileSync("git", ["diff", "--name-only"], { cwd: fileURLToPath(new URL("..", import.meta.url)) })
      .toString(),
  };

  const stdout = execFileSync("node", [scriptPath, "patch", "--base", "0.1.0", "--dry-run"]).toString().trim();

  const after = {
    packageJson: execFileSync("git", ["diff", "--name-only"], { cwd: fileURLToPath(new URL("..", import.meta.url)) })
      .toString(),
  };

  assert.equal(stdout, "0.1.1");
  assert.equal(before.packageJson, after.packageJson, "--dry-run must not modify any tracked file");
});
