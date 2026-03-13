import "./checkNodeVersion.js";

import { execSync } from "child_process";
import { createWriteStream, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

import zipper from "zip-local";

const BASE_URL = "https://github.com/Vencord/Installer/releases/latest/download/";
const INSTALLER_PATH_DARWIN = "VencordInstaller.app/Contents/MacOS/VencordInstaller";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT, "dist");
const IMAGES_DIR = join(ROOT, "Images");
const RELEASE_DIR = join(DIST_DIR, "release");
const BUNDLE_DIR = join(RELEASE_DIR, "ReCord-Installer-Bundle");

function assertBuildExists() {
    if (!existsSync(join(DIST_DIR, "renderer.js"))) {
        throw new Error("Build output not found. Run npm run build or pnpm build first.");
    }
}

function getInstallerConfig() {
    switch (process.platform) {
        case "win32":
            return {
                downloadName: "VencordInstallerCli.exe",
                outputName: "ReCordInstallerCli.exe",
                artifactName: "ReCord-Windows-Installer.zip"
            };
        case "darwin":
            return {
                downloadName: "VencordInstaller.MacOS.zip",
                outputName: "ReCordInstaller",
                artifactName: "ReCord-macOS-Installer.zip"
            };
        case "linux":
            return {
                downloadName: "VencordInstallerCli-linux",
                outputName: "ReCordInstallerCli-linux",
                artifactName: "ReCord-Linux-Installer.zip"
            };
        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
}

async function downloadInstaller(tempDir) {
    const cfg = getInstallerConfig();
    mkdirSync(tempDir, { recursive: true });
    const sourcePath = join(tempDir, cfg.downloadName);
    const targetPath = join(BUNDLE_DIR, cfg.outputName);
    const res = await fetch(BASE_URL + cfg.downloadName, {
        headers: {
            "User-Agent": "ReCord Release Builder (https://github.com/InfluenceDevs/ReCord)"
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to download installer: ${res.status} ${res.statusText}`);
    }

    if (process.platform === "darwin") {
        const zip = new Uint8Array(await res.arrayBuffer());
        const ff = await import("fflate");
        const bytes = ff.unzipSync(zip, {
            filter: f => f.name === INSTALLER_PATH_DARWIN
        })[INSTALLER_PATH_DARWIN];
        writeFileSync(targetPath, bytes, { mode: 0o755 });
        return targetPath;
    }

    const body = Readable.fromWeb(res.body);
    await finished(body.pipe(createWriteStream(sourcePath, {
        mode: 0o755,
        autoClose: true
    })));
    cpSync(sourcePath, targetPath);
    return targetPath;
}

function makeInstallScripts() {
    const cfg = getInstallerConfig();
    const readme = `ReCord Release Bundle\n\n1. Run the installer script for your platform.\n2. The bundled dist assets from this release are used automatically.\n3. Use the uninstall script to remove the patch later.\n`;

    writeFileSync(join(BUNDLE_DIR, "README.txt"), readme);

    writeFileSync(join(BUNDLE_DIR, "Install-ReCord.cmd"), [
        "@echo off",
        "setlocal",
        "set ROOT=%~dp0",
        "set VENCORD_USER_DATA_DIR=%ROOT%app",
        "set VENCORD_DEV_INSTALL=1",
        `\"%ROOT%${cfg.outputName}\" --install`,
        "endlocal"
    ].join("\r\n"));

    writeFileSync(join(BUNDLE_DIR, "Uninstall-ReCord.cmd"), [
        "@echo off",
        "setlocal",
        "set ROOT=%~dp0",
        "set VENCORD_USER_DATA_DIR=%ROOT%app",
        "set VENCORD_DEV_INSTALL=1",
        `\"%ROOT%${cfg.outputName}\" --uninstall`,
        "endlocal"
    ].join("\r\n"));

    writeFileSync(join(BUNDLE_DIR, "Install-ReCord.ps1"), [
        "$ErrorActionPreference = 'Stop'",
        "$root = Split-Path -Parent $MyInvocation.MyCommand.Path",
        "$env:VENCORD_USER_DATA_DIR = Join-Path $root 'app'",
        "$env:VENCORD_DEV_INSTALL = '1'",
        `& (Join-Path $root '${cfg.outputName}') --install`
    ].join("\n"));

    writeFileSync(join(BUNDLE_DIR, "Uninstall-ReCord.ps1"), [
        "$ErrorActionPreference = 'Stop'",
        "$root = Split-Path -Parent $MyInvocation.MyCommand.Path",
        "$env:VENCORD_USER_DATA_DIR = Join-Path $root 'app'",
        "$env:VENCORD_DEV_INSTALL = '1'",
        `& (Join-Path $root '${cfg.outputName}') --uninstall`
    ].join("\n"));
}

function copyAppPayload() {
    const appDir = join(BUNDLE_DIR, "app");
    const payloadDistDir = join(appDir, "dist");
    mkdirSync(payloadDistDir, { recursive: true });

    for (const entry of readdirSync(DIST_DIR, { withFileTypes: true })) {
        if (entry.name === "release") continue;
        cpSync(join(DIST_DIR, entry.name), join(payloadDistDir, entry.name), {
            recursive: entry.isDirectory(),
            force: true
        });
    }

    if (existsSync(IMAGES_DIR)) {
        cpSync(IMAGES_DIR, join(appDir, "Images"), { recursive: true, force: true });
    }
    cpSync(join(ROOT, "package.json"), join(appDir, "package.json"), { force: true });
}

async function main() {
    assertBuildExists();

    rmSync(BUNDLE_DIR, { recursive: true, force: true });
    mkdirSync(BUNDLE_DIR, { recursive: true });

    copyAppPayload();
    await downloadInstaller(join(RELEASE_DIR, "tmp"));
    makeInstallScripts();

    const cfg = getInstallerConfig();
    const zipPath = join(RELEASE_DIR, cfg.artifactName);
    rmSync(zipPath, { force: true });

    zipper.sync.zip(BUNDLE_DIR).compress().save(zipPath);

    const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
    writeFileSync(join(RELEASE_DIR, "release-manifest.json"), JSON.stringify({
        name: "ReCord",
        version,
        artifact: cfg.artifactName,
        platform: process.platform,
        builtAt: new Date().toISOString(),
        commit: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim()
    }, null, 2));

    console.log(`Release bundle created: ${zipPath}`);
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
