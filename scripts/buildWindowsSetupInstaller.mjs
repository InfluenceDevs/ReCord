import "./checkNodeVersion.js";

import { execSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync, createWriteStream } from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = join(ROOT, "dist", "release");
const INSTALLER_DIR = join(ROOT, "..", "ReCord-Installer");
const SETUP_DOWNLOAD_URL = "https://github.com/InfluenceDevs/ReCord/releases/latest/download/ReCordSetup.exe";

function getRequestHeaders() {
    const headers = {
        "User-Agent": "ReCord Setup Builder (https://github.com/InfluenceDevs/ReCord)"
    };

    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    return headers;
}

async function downloadLatestSetup(targetPath) {
    const res = await fetch(SETUP_DOWNLOAD_URL, { headers: getRequestHeaders() });
    if (!res.ok || !res.body) {
        throw new Error(`Failed to download fallback setup from ${SETUP_DOWNLOAD_URL}: ${res.status} ${res.statusText}`);
    }

    const body = Readable.fromWeb(res.body);
    await finished(body.pipe(createWriteStream(targetPath)));
}

async function main() {
    mkdirSync(RELEASE_DIR, { recursive: true });
    const out = join(RELEASE_DIR, "ReCordSetup.exe");

    if (!existsSync(INSTALLER_DIR)) {
        console.warn(`ReCord-Installer directory not found at ${INSTALLER_DIR}. Falling back to latest published ReCordSetup.exe.`);
        await downloadLatestSetup(out);
        console.log("Downloaded setup fallback: dist/release/ReCordSetup.exe");
        return;
    }

    console.log("Building ReCord Electron installer...");

    // Install deps then build + package
    execSync("corepack yarn install --frozen-lockfile", {
        stdio: "inherit",
        cwd: INSTALLER_DIR
    });

    execSync("corepack yarn dist", {
        stdio: "inherit",
        cwd: INSTALLER_DIR
    });

    // electron-builder outputs to <installer>/dist/<productName> Setup <version>.exe
    const distDir = join(INSTALLER_DIR, "dist");
    // electron-builder portable target produces "ReCord Installer-Windows.exe"
    const setups = readdirSync(distDir).filter(f => f.endsWith(".exe") && !f.includes("Cli") && f.includes("ReCord"));

    if (setups.length === 0) {
        throw new Error("No installer .exe found in ReCord-Installer/dist after build.");
    }

    copyFileSync(join(distDir, setups[0]), out);

    console.log(`Built installer: dist/release/ReCordSetup.exe`);
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});

