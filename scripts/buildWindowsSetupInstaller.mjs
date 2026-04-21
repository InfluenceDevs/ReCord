import "./checkNodeVersion.js";

import { execSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync, cpSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = join(ROOT, "dist", "release");
const INSTALLER_DIR = join(ROOT, "..", "ReCord-Installer");
const TEMP_INSTALLER_DIR = join(ROOT, "..", ".record-installer-build");
const INSTALLER_TEMPLATE_DIR = join(ROOT, "scripts", "recordInstallerTemplate");
const UPSTREAM_INSTALLER_REPO = "https://github.com/BetterDiscord/Installer.git";

function prepareTempInstallerDir() {
    rmSync(TEMP_INSTALLER_DIR, { force: true, recursive: true });
    execSync(`git clone --depth=1 --branch development ${UPSTREAM_INSTALLER_REPO} "${TEMP_INSTALLER_DIR}"`, {
        stdio: "inherit",
        cwd: ROOT
    });

    cpSync(INSTALLER_TEMPLATE_DIR, TEMP_INSTALLER_DIR, {
        force: true,
        recursive: true
    });

    return TEMP_INSTALLER_DIR;
}

async function main() {
    mkdirSync(RELEASE_DIR, { recursive: true });
    const out = join(RELEASE_DIR, "ReCordSetup.exe");
    const installerDir = existsSync(INSTALLER_DIR)
        ? INSTALLER_DIR
        : prepareTempInstallerDir();

    console.log("Building ReCord Electron installer...");

    execSync("corepack yarn install --frozen-lockfile", {
        stdio: "inherit",
        cwd: installerDir
    });

    execSync("corepack yarn dist", {
        stdio: "inherit",
        cwd: installerDir
    });

    const distDir = join(installerDir, "dist");
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

