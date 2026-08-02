#!/usr/bin/env node
// SPEC: release-distribution (REL-14, REL-18)
//
// Builds the Windows portable bundle: the app in a folder that runs from
// anywhere, with a marker file `paths::flavor` uses to detect portable mode.
// Tauri has no portable bundle target, and the official updater has no
// portable path either — this archive is what the in-app portable updater
// downloads and swaps in. See .specs/features/release-distribution/design.md.
//
// Usage:
//   node scripts/make-portable.mjs --version 1.2.3 [--binary <path>] [--resources <path>] [--out <dir>]

import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const APP_NAME = "SwarmDeck";
/** Read by `paths::flavor` in the Rust backend. Keep both sides in sync. */
export const PORTABLE_MARKER = ".portable";

export function portableArchiveName(version, arch = "x64") {
  if (!/^\d+\.\d+\.\d+$/.test(String(version ?? ""))) {
    throw new Error(`invalid version: ${JSON.stringify(version)}`);
  }
  return `${APP_NAME}_${version}_${arch}-portable.zip`;
}

export function portableReadme(version) {
  return [
    `${APP_NAME} ${version} — versão portátil`,
    "",
    "1. Extraia esta pasta para qualquer lugar onde você tenha permissão de escrita",
    "   (Documentos, Desktop, um pendrive). Não precisa de administrador.",
    `2. Execute ${APP_NAME}.exe.`,
    "3. Seus dados ficam em ./data, ao lado do executável — nada é gravado em",
    "   %APPDATA% e nada é escrito no registro do Windows.",
    "",
    `Não apague o arquivo ${PORTABLE_MARKER}: é ele que mantém o app em modo`,
    "portátil e permite que as atualizações sejam aplicadas sem instalação.",
    "",
  ].join("\n");
}

function zipDirectory(sourceDir, destination) {
  // Compress-Archive ships with Windows and needs no extra tooling on the
  // runner. The portable bundle is Windows-only, so there is no other branch.
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Compress-Archive -Path '${sourceDir}' -DestinationPath '${destination}' -Force`,
    ],
    { stdio: "inherit" },
  );
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) flags[arg.slice(2)] = argv[++i];
  }
  return flags;
}

/**
 * Lays out the folder that becomes the archive. Split from `main` so the
 * contents can be asserted without running the zipper.
 *
 * Unlike local-mind's version, `resources` is optional: tauri.conf.json does
 * not declare `bundle.resources` yet (nothing is vendored today — see
 * design.md, "Empacotar o sidecar MCP"), so a missing/absent resources dir is
 * a no-op here instead of a hard error. When the sidecar lands and the config
 * gains a resources entry, passing that path starts copying it without
 * further changes to this function.
 */
export function stageBundle({ appDir, binary, resources, version }) {
  if (!existsSync(binary)) {
    throw new Error(
      `binary not found: ${binary}\n` +
        "Run the Tauri build first, and check that tauri.conf.json sets mainBinaryName.",
    );
  }

  mkdirSync(appDir, { recursive: true });
  copyFileSync(binary, join(appDir, `${APP_NAME}.exe`));
  writeFileSync(join(appDir, PORTABLE_MARKER), "");
  writeFileSync(join(appDir, "LEIA-ME.txt"), portableReadme(version));

  // Present only when Tauri's bundler produces it for the target WebView2
  // delivery mode — not every mode does, so this is opportunistic, not
  // required.
  const webview2Loader = join(dirname(binary), "WebView2Loader.dll");
  if (existsSync(webview2Loader)) {
    copyFileSync(webview2Loader, join(appDir, "WebView2Loader.dll"));
  }

  if (resources && existsSync(resources)) {
    cpSync(resources, join(appDir, "resources"), { recursive: true });
  }

  return appDir;
}

function main(argv) {
  const flags = parseArgs(argv);
  const version = flags.version;
  if (!version) throw new Error("--version is required");
  // Validates the version shape before any I/O happens below — an invalid
  // version must fail without creating or touching any file or directory.
  portableArchiveName(version);

  const binary = resolve(flags.binary ?? join(ROOT, "src-tauri", "target", "release", `${APP_NAME}.exe`));
  const outDir = resolve(flags.out ?? join(ROOT, "src-tauri", "target", "release", "portable"));
  const stagingRoot = join(outDir, "staging");
  const appDir = join(stagingRoot, APP_NAME);

  rmSync(stagingRoot, { recursive: true, force: true });
  stageBundle({
    appDir,
    binary,
    resources: resolve(flags.resources ?? join(dirname(binary), "resources")),
    version,
  });

  const archive = join(outDir, portableArchiveName(version));
  rmSync(archive, { force: true });
  zipDirectory(appDir, archive);
  rmSync(stagingRoot, { recursive: true, force: true });

  // stdout is consumed by the workflow — keep it to the path alone.
  process.stdout.write(`${archive}\n`);
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
