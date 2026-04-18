import "./checkNodeVersion.js";

import { execSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = join(ROOT, "dist", "release");
const INSTALLER_DIR = join(ROOT, "..", "ReCord-Installer");

function main() {
    if (!existsSync(INSTALLER_DIR)) {
        throw new Error(`ReCord-Installer directory not found at ${INSTALLER_DIR}. Clone it alongside the Vencord repo.`);
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

    mkdirSync(RELEASE_DIR, { recursive: true });
    const out = join(RELEASE_DIR, "ReCordSetup.exe");
    copyFileSync(join(distDir, setups[0]), out);

    console.log(`Built installer: dist/release/ReCordSetup.exe`);
}

main();

