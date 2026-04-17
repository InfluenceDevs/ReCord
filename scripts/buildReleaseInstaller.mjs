import "./checkNodeVersion.js";

import { execSync } from "child_process";
import { createWriteStream, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

import zipper from "zip-local";

const INSTALLER_BASE_URLS = [
    process.env.RECORD_INSTALLER_BASE_URL,
    "https://github.com/InfluenceDevs/ReCord/releases/latest/download/"
].filter(Boolean);
const RECORD_REPO_API = "https://api.github.com/repos/InfluenceDevs/ReCord";

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
                downloadName: "ReCordInstallerCli.exe",
                outputName: "ReCordInstallerCli.exe",
                artifactName: "ReCord-Windows-Installer.zip"
            };
        case "darwin":
            return {
                downloadName: "ReCordInstaller",
                outputName: "ReCordInstaller",
                artifactName: "ReCord-macOS-Installer.zip"
            };
        case "linux":
            return {
                downloadName: "ReCordInstallerCli-linux",
                outputName: "ReCordInstallerCli-linux",
                artifactName: "ReCord-Linux-Installer.zip"
            };
        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
}

async function findLatestAssetUrl(assetName) {
    const res = await fetch(`${RECORD_REPO_API}/releases/latest`, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "ReCord Release Builder (https://github.com/InfluenceDevs/ReCord)"
        }
    });

    if (!res.ok) return null;

    const data = await res.json();
    const asset = data?.assets?.find?.(a => a?.name === assetName);
    return asset?.browser_download_url ?? null;
}

async function extractBinaryFromArchive(archiveUrl, outputFile, outputName) {
    const res = await fetch(archiveUrl, {
        headers: {
            "User-Agent": "ReCord Release Builder (https://github.com/InfluenceDevs/ReCord)"
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to download archive fallback: ${res.status} ${res.statusText}`);
    }

    const zip = new Uint8Array(await res.arrayBuffer());
    const ff = await import("fflate");
    const all = ff.unzipSync(zip);

    const targetPath = Object.keys(all).find(path => path.endsWith(outputName));
    if (!targetPath) {
        throw new Error(`Archive fallback missing ${outputName}`);
    }

    writeFileSync(outputFile, all[targetPath], { mode: 0o755 });
}

async function downloadInstaller(tempDir) {
    const cfg = getInstallerConfig();
    mkdirSync(tempDir, { recursive: true });
    const sourcePath = join(tempDir, cfg.downloadName);
    const targetPath = join(BUNDLE_DIR, cfg.outputName);
    let res = null;

    for (const baseUrl of INSTALLER_BASE_URLS) {
        const candidate = await fetch(baseUrl + cfg.downloadName, {
            headers: {
                "User-Agent": "ReCord Release Builder (https://github.com/InfluenceDevs/ReCord)"
            }
        });

        if (!candidate.ok) {
            if (candidate.status === 404) continue;
            throw new Error(`Failed to download installer from ${baseUrl}: ${candidate.status} ${candidate.statusText}`);
        }

        res = candidate;
        break;
    }

    if (res) {
        const body = Readable.fromWeb(res.body);
        await finished(body.pipe(createWriteStream(sourcePath, {
            mode: 0o755,
            autoClose: true
        })));
        cpSync(sourcePath, targetPath);
        return targetPath;
    }

    const archiveUrl = await findLatestAssetUrl(cfg.artifactName);
    if (!archiveUrl) {
        throw new Error(`Failed to download installer binary ${cfg.downloadName} from direct URLs and archive ${cfg.artifactName} was not found.`);
    }

    await extractBinaryFromArchive(archiveUrl, targetPath, cfg.outputName);
    return targetPath;
}

function makeInstallScripts() {
    const cfg = getInstallerConfig();
    const readme = `ReCord Release Bundle\n\n1. Run Install-ReCord.cmd (or .ps1) to patch Discord.\n2. Optional first arg for branch: auto|stable|ptb|canary\n3. Optional second arg for custom location path.\n4. Use Repair-ReCord.cmd/.ps1 to repair patching.\n5. Use Uninstall-ReCord.cmd/.ps1 to remove the patch.\n`;

    writeFileSync(join(BUNDLE_DIR, "README.txt"), readme);

    writeFileSync(join(BUNDLE_DIR, "Install-ReCord.cmd"), [
        "@echo off",
        "setlocal",
        "set ROOT=%~dp0",
        "set BRANCH=%~1",
        "if \"%BRANCH%\"==\"\" set BRANCH=auto",
        "set LOCATION=%~2",
        "set RECORD_USER_DATA_DIR=%ROOT%app",
        "set RECORD_DEV_INSTALL=1",
        "set VENCORD_USER_DATA_DIR=%ROOT%app",
        "set VENCORD_DEV_INSTALL=1",
        `if \"%LOCATION%\"==\"\" (\"%ROOT%${cfg.outputName}\" --install -branch %BRANCH%) else (\"%ROOT%${cfg.outputName}\" --install -location \"%LOCATION%\")`,
        "endlocal"
    ].join("\r\n"));

    writeFileSync(join(BUNDLE_DIR, "Repair-ReCord.cmd"), [
        "@echo off",
        "setlocal",
        "set ROOT=%~dp0",
        "set BRANCH=%~1",
        "if \"%BRANCH%\"==\"\" set BRANCH=auto",
        "set LOCATION=%~2",
        "set RECORD_USER_DATA_DIR=%ROOT%app",
        "set RECORD_DEV_INSTALL=1",
        "set VENCORD_USER_DATA_DIR=%ROOT%app",
        "set VENCORD_DEV_INSTALL=1",
        `if \"%LOCATION%\"==\"\" (\"%ROOT%${cfg.outputName}\" -repair -branch %BRANCH%) else (\"%ROOT%${cfg.outputName}\" -repair -location \"%LOCATION%\")`,
        "endlocal"
    ].join("\r\n"));

    writeFileSync(join(BUNDLE_DIR, "Uninstall-ReCord.cmd"), [
        "@echo off",
        "setlocal",
        "set ROOT=%~dp0",
        "set BRANCH=%~1",
        "if \"%BRANCH%\"==\"\" set BRANCH=auto",
        "set LOCATION=%~2",
        "set RECORD_USER_DATA_DIR=%ROOT%app",
        "set RECORD_DEV_INSTALL=1",
        "set VENCORD_USER_DATA_DIR=%ROOT%app",
        "set VENCORD_DEV_INSTALL=1",
        `if \"%LOCATION%\"==\"\" (\"%ROOT%${cfg.outputName}\" --uninstall -branch %BRANCH%) else (\"%ROOT%${cfg.outputName}\" --uninstall -location \"%LOCATION%\")`,
        "endlocal"
    ].join("\r\n"));

    writeFileSync(join(BUNDLE_DIR, "Install-ReCord.ps1"), [
        "$ErrorActionPreference = 'Stop'",
        "param([string]$Branch = 'auto', [string]$Location = '')",
        "$root = Split-Path -Parent $MyInvocation.MyCommand.Path",
        "$env:RECORD_USER_DATA_DIR = Join-Path $root 'app'",
        "$env:RECORD_DEV_INSTALL = '1'",
        "$env:VENCORD_USER_DATA_DIR = Join-Path $root 'app'",
        "$env:VENCORD_DEV_INSTALL = '1'",
        `$exe = (Join-Path $root '${cfg.outputName}')`,
        "if ($Location -ne '') { & $exe --install -location $Location } else { & $exe --install -branch $Branch }"
    ].join("\n"));

    writeFileSync(join(BUNDLE_DIR, "Repair-ReCord.ps1"), [
        "$ErrorActionPreference = 'Stop'",
        "param([string]$Branch = 'auto', [string]$Location = '')",
        "$root = Split-Path -Parent $MyInvocation.MyCommand.Path",
        "$env:RECORD_USER_DATA_DIR = Join-Path $root 'app'",
        "$env:RECORD_DEV_INSTALL = '1'",
        "$env:VENCORD_USER_DATA_DIR = Join-Path $root 'app'",
        "$env:VENCORD_DEV_INSTALL = '1'",
        `$exe = (Join-Path $root '${cfg.outputName}')`,
        "if ($Location -ne '') { & $exe -repair -location $Location } else { & $exe -repair -branch $Branch }"
    ].join("\n"));

    writeFileSync(join(BUNDLE_DIR, "Uninstall-ReCord.ps1"), [
        "$ErrorActionPreference = 'Stop'",
        "param([string]$Branch = 'auto', [string]$Location = '')",
        "$root = Split-Path -Parent $MyInvocation.MyCommand.Path",
        "$env:RECORD_USER_DATA_DIR = Join-Path $root 'app'",
        "$env:RECORD_DEV_INSTALL = '1'",
        "$env:VENCORD_USER_DATA_DIR = Join-Path $root 'app'",
        "$env:VENCORD_DEV_INSTALL = '1'",
        `$exe = (Join-Path $root '${cfg.outputName}')`,
        "if ($Location -ne '') { & $exe --uninstall -location $Location } else { & $exe --uninstall -branch $Branch }"
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
    mkdirSync(RELEASE_DIR, { recursive: true });

    copyAppPayload();
    await downloadInstaller(join(RELEASE_DIR, "tmp"));
    makeInstallScripts();

    // Copy standalone one-liner install scripts to release dir for direct download
    const installerDir = join(ROOT, "installer");
    for (const script of ["install.ps1", "install.sh"]) {
        const src = join(installerDir, script);
        if (existsSync(src)) {
            cpSync(src, join(RELEASE_DIR, script), { force: true });
        }
    }

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
