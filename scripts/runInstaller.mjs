/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./checkNodeVersion.js";

import { execFileSync, execSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

const INSTALLER_BASE_URLS = [
    process.env.RECORD_INSTALLER_BASE_URL,
    "https://github.com/InfluenceDevs/ReCord/releases/latest/download/"
].filter(Boolean);
const RECORD_REPO_API = "https://api.github.com/repos/InfluenceDevs/ReCord";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE_DIR = join(BASE_DIR, "dist", "Installer");
const ETAG_FILE = join(FILE_DIR, "etag.txt");

function getFilename() {
    switch (process.platform) {
        case "win32":
            return "ReCordInstallerCli.exe";
        case "darwin":
            return "ReCordInstaller";
        case "linux":
            return "ReCordInstallerCli-linux";
        default:
            throw new Error("Unsupported platform: " + process.platform);
    }
}

function getPlatformArchiveAsset() {
    switch (process.platform) {
        case "win32":
            return "ReCord-Windows-Installer.zip";
        case "darwin":
            return "ReCord-macOS-Installer.zip";
        case "linux":
            return "ReCord-Linux-Installer.zip";
        default:
            throw new Error("Unsupported platform: " + process.platform);
    }
}

function getPlatformBinaryName() {
    switch (process.platform) {
        case "win32":
            return "ReCordInstallerCli.exe";
        case "darwin":
            return "ReCordInstaller";
        case "linux":
            return "ReCordInstallerCli-linux";
        default:
            throw new Error("Unsupported platform: " + process.platform);
    }
}

async function findLatestAssetUrl(assetName) {
    const res = await fetch(`${RECORD_REPO_API}/releases/latest`, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "ReCord (https://github.com/InfluenceDevs/ReCord)"
        }
    });

    if (!res.ok) return null;

    const data = await res.json();
    const asset = data?.assets?.find?.(a => a?.name === assetName);
    return asset?.browser_download_url ?? null;
}

async function extractBinaryFromArchive(archiveUrl, outputFile) {
    const res = await fetch(archiveUrl, {
        headers: {
            "User-Agent": "ReCord (https://github.com/InfluenceDevs/ReCord)"
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to download archive fallback: ${res.status} ${res.statusText}`);
    }

    const zip = new Uint8Array(await res.arrayBuffer());
    const ff = await import("fflate");
    const all = ff.unzipSync(zip);

    const targetName = getPlatformBinaryName();
    const targetPath = Object.keys(all).find(path => path.endsWith(targetName));
    if (!targetPath) {
        throw new Error(`Archive fallback missing ${targetName}`);
    }

    writeFileSync(outputFile, all[targetPath], { mode: 0o755 });
}

function getVersion() {
    return JSON.parse(readFileSync(join(BASE_DIR, "package.json"), "utf8")).version;
}

function isUsableFile(path) {
    try {
        return existsSync(path) && statSync(path).size > 0;
    } catch {
        return false;
    }
}

function findLocalReleaseInstaller() {
    const releaseManifest = join(BASE_DIR, "dist", "release", "release-manifest.json");
    const bundledBinary = join(BASE_DIR, "dist", "release", "ReCord-Installer-Bundle", getPlatformBinaryName());
    const distBinary = join(BASE_DIR, "dist", "Installer", getPlatformBinaryName());

    if (existsSync(releaseManifest) && isUsableFile(bundledBinary)) {
        try {
            const manifest = JSON.parse(readFileSync(releaseManifest, "utf8"));
            if (manifest?.version === getVersion()) {
                return bundledBinary;
            }
        } catch {
            // Fall through to other local candidates.
        }
    }

    if (isUsableFile(distBinary)) {
        return distBinary;
    }

    return null;
}

function buildLocalReleaseInstaller() {
    console.log("Building local ReCord release installer bundle from current sources...");
    execFileSync(process.execPath, [join(BASE_DIR, "scripts", "buildReleaseInstaller.mjs")], {
        cwd: BASE_DIR,
        stdio: "inherit",
        env: process.env
    });
}

async function ensureBinary() {
    const localBinary = findLocalReleaseInstaller();
    if (localBinary) {
        console.log("Using local ReCord installer bundle binary:", localBinary);
        return localBinary;
    }

    buildLocalReleaseInstaller();

    const builtLocalBinary = findLocalReleaseInstaller();
    if (builtLocalBinary) {
        console.log("Using freshly built local ReCord installer bundle binary:", builtLocalBinary);
        return builtLocalBinary;
    }

    const filename = getFilename();
    console.log("Resolving ReCord installer binary: " + filename);

    mkdirSync(FILE_DIR, { recursive: true });

    const outputFile = join(FILE_DIR, filename);

    const etag = existsSync(outputFile) && existsSync(ETAG_FILE)
        ? readFileSync(ETAG_FILE, "utf-8")
        : null;

    let res = null;
    for (const baseUrl of INSTALLER_BASE_URLS) {
        const candidate = await fetch(baseUrl + filename, {
            headers: {
                "User-Agent": "ReCord (https://github.com/InfluenceDevs/ReCord)",
                "If-None-Match": etag
            }
        });

        if (candidate.status === 404) continue;

        res = candidate;
        break;
    }

    if (!res) {
        const fallbackAsset = getPlatformArchiveAsset();
        const archiveUrl = await findLatestAssetUrl(fallbackAsset);
        if (!archiveUrl) {
            throw new Error(`Failed to download installer binary ${filename} from any configured source.`);
        }

        console.log(`Falling back to ${fallbackAsset} from latest ReCord release...`);
        await extractBinaryFromArchive(archiveUrl, outputFile);
        console.log("Finished downloading!");
        return outputFile;
    }

    if (res.status === 304) {
        console.log("Up to date, not redownloading!");
        return outputFile;
    }
    if (!res.ok)
        throw new Error(`Failed to download installer: ${res.status} ${res.statusText}`);

    writeFileSync(ETAG_FILE, res.headers.get("etag"));

    // WHY DOES NODE FETCH RETURN A WEB STREAM OH MY GOD
    const body = Readable.fromWeb(res.body);
    await finished(body.pipe(createWriteStream(outputFile, {
        mode: 0o755,
        autoClose: true
    })));

    if (process.platform === "darwin") {
        console.log("Overriding security policy for installer binary (this is required to run it)");
        console.log("xattr might error, that's okay");

        const logAndRun = cmd => {
            console.log("Running", cmd);
            try {
                execSync(cmd);
            } catch { }
        };
        logAndRun(`sudo spctl --add '${outputFile}' --label "ReCord Installer"`);
        logAndRun(`sudo xattr -d com.apple.quarantine '${outputFile}'`);
    }

    console.log("Finished downloading!");

    return outputFile;
}



const installerBin = await ensureBinary();

console.log("Now running Installer...");

const argStart = process.argv.indexOf("--");
const args = argStart === -1 ? [] : process.argv.slice(argStart + 1);

try {
    execFileSync(installerBin, args, {
        stdio: "inherit",
        env: {
            ...process.env,
            RECORD_USER_DATA_DIR: BASE_DIR,
            RECORD_DEV_INSTALL: "1",
            VENCORD_USER_DATA_DIR: BASE_DIR,
            VENCORD_DEV_INSTALL: "1",
            RECORD_FORCE_BRAND: "1"
        }
    });
} catch {
    console.error("Something went wrong. Please check the logs above.");
}
