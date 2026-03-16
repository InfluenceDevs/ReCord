import "./checkNodeVersion.js";

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = join(ROOT, "dist", "release");
const BUNDLE_DIR = join(RELEASE_DIR, "ReCord-Installer-Bundle");
const NSI_FILE = join(ROOT, "installer", "ReCordInstaller.nsi");
const PACKAGE_JSON = join(ROOT, "package.json");

function getVersion() {
    return JSON.parse(readFileSync(PACKAGE_JSON, "utf8")).version;
}

function findMakensis() {
    const candidates = [
        "makensis",
        "C:\\Program Files (x86)\\NSIS\\makensis.exe",
        "C:\\Program Files\\NSIS\\makensis.exe"
    ];

    for (const candidate of candidates) {
        try {
            execFileSync(candidate, ["/VERSION"], { stdio: "ignore" });
            return candidate;
        } catch {
            // continue
        }
    }

    throw new Error("NSIS makensis not found. Install NSIS or run this on the release workflow.");
}

function main() {
    if (process.platform !== "win32") {
        console.log("Skipping NSIS build: Windows only");
        return;
    }

    if (!existsSync(BUNDLE_DIR)) {
        throw new Error("Installer bundle missing. Run node scripts/buildReleaseInstaller.mjs first.");
    }

    mkdirSync(RELEASE_DIR, { recursive: true });

    const makensis = findMakensis();
    const appIconCandidates = [
        join(ROOT, "Images", "app.ico"),
        join(ROOT, "Images", "icon.ico")
    ];
    const appIcon = appIconCandidates.find(p => existsSync(p));

    const defines = [
        `/DPRODUCT_VERSION=${getVersion()}`,
        `/DSOURCE_DIR=${BUNDLE_DIR}`,
        `/DOUT_FILE=${join(RELEASE_DIR, "ReCordSetup.exe")}`
    ];

    if (appIcon) {
        defines.push(`/DAPP_ICON=${appIcon}`);
    }

    execFileSync(makensis, [...defines, NSI_FILE], {
        stdio: "inherit",
        cwd: ROOT
    });

    console.log("Built NSIS installer: dist/release/ReCordSetup.exe");
}

main();
