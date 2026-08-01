// SPEC: release-distribution (REL-03, REL-04, REL-30)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const BUMP_KINDS = new Set(["major", "minor", "patch"]);

/**
 * Parses a strict `X.Y.Z` version string into its numeric parts.
 * Throws an explicit error for anything that doesn't match that shape.
 */
export function parseVersion(raw) {
  const match = VERSION_RE.exec(raw);
  if (!match) {
    throw new Error(`invalid version "${raw}": expected X.Y.Z`);
  }
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/**
 * Applies a semver increment (`major` | `minor` | `patch`) to `current`.
 * Unknown increments and malformed base versions fail loudly instead of
 * silently producing a wrong version.
 */
export function bumpVersion(current, kind) {
  if (!BUMP_KINDS.has(kind)) {
    throw new Error(`unknown bump kind "${kind}": expected patch, minor or major`);
  }
  const { major, minor, patch } = parseVersion(current);
  switch (kind) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`unknown bump kind "${kind}": expected patch, minor or major`);
  }
}

/**
 * Resolves the CLI `target` argument to a concrete `X.Y.Z` version.
 * `target` may already be an explicit version, or a bump kind that gets
 * applied on top of `base`.
 */
export function resolveVersion(target, base) {
  if (VERSION_RE.test(target)) {
    return target;
  }
  if (!base) {
    throw new Error(`--base is required when bumping by kind "${target}"`);
  }
  return bumpVersion(base, target);
}

/**
 * Rewrites the `version` field of a `package.json`/`package-lock.json`
 * shaped JSON source. Also covers `packages[""].version`, which is where
 * npm's lockfile v3 duplicates the root package version.
 */
export function setJsonVersion(source, version) {
  const data = JSON.parse(source);
  data.version = version;
  if (data.packages && Object.prototype.hasOwnProperty.call(data.packages, "")) {
    data.packages[""].version = version;
  }
  return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * Rewrites only the `version` key that lives inside the `[workspace.package]`
 * table of the root `Cargo.toml`. A naive global replace would also hit
 * pinned dependency versions elsewhere in the file — this walks section
 * boundaries instead of using a blind regex substitution.
 */
export function setWorkspaceVersion(source, version) {
  const lines = source.split("\n");
  let inWorkspacePackage = false;
  let replaced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (sectionMatch) {
      inWorkspacePackage = sectionMatch[1].trim() === "workspace.package";
      continue;
    }
    if (inWorkspacePackage && /^\s*version\s*=/.test(line)) {
      lines[i] = `version = "${version}"`;
      replaced = true;
    }
  }

  if (!replaced) {
    throw new Error('no "version" key found inside [workspace.package]');
  }

  return lines.join("\n");
}

function parseArgs(argv) {
  const [target, ...rest] = argv;
  if (!target) {
    throw new Error("usage: bump-version.mjs <patch|minor|major|X.Y.Z> [--base X.Y.Z] [--dry-run]");
  }

  let base;
  let dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--dry-run") {
      dryRun = true;
    } else if (rest[i] === "--base") {
      base = rest[i + 1];
      i++;
    }
  }

  return { target, base, dryRun };
}

function main() {
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  const { target, base, dryRun } = parseArgs(process.argv.slice(2));
  const version = resolveVersion(target, base);

  if (dryRun) {
    console.log(version);
    return;
  }

  const packageJsonPath = `${rootDir}package.json`;
  const packageLockPath = `${rootDir}package-lock.json`;
  const cargoTomlPath = `${rootDir}Cargo.toml`;

  writeFileSync(packageJsonPath, setJsonVersion(readFileSync(packageJsonPath, "utf8"), version));
  writeFileSync(packageLockPath, setJsonVersion(readFileSync(packageLockPath, "utf8"), version));
  writeFileSync(cargoTomlPath, setWorkspaceVersion(readFileSync(cargoTomlPath, "utf8"), version));

  console.log(version);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main();
}
