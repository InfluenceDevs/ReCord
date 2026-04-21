import "./checkNodeVersion.js";

import { execSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync, cpSync, rmSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = join(ROOT, "dist", "release");
const INSTALLER_DIR = join(ROOT, "..", "ReCord-Installer");
const TEMP_INSTALLER_DIR = join(ROOT, "..", ".record-installer-build");
const INSTALLER_TEMPLATE_DIR = join(ROOT, "scripts", "recordInstallerTemplate");
const UPSTREAM_INSTALLER_REPO = "https://github.com/BetterDiscord/Installer.git";

function toPosixPath(p) {
    return p.replace(/\\/g, "/");
}

function overlayInstallerTemplate(installerDir) {
    // Always overlay template so both local and temp installer dirs use ReCord-branded sources.
    for (const entry of readdirSync(INSTALLER_TEMPLATE_DIR)) {
        cpSync(join(INSTALLER_TEMPLATE_DIR, entry), join(installerDir, entry), {
            force: true,
            recursive: true
        });
    }
}

function configureInstallerResources(installerDir) {
    const packageJsonPath = join(installerDir, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    packageJson.build ??= {};

    // Enforce ReCord branding for every artifact type (portable exe + zip wrapper).
    packageJson.name = "record-installer";
    packageJson.productName = "ReCord Installer";
    packageJson.description = "A simple standalone program which automates the installation, removal and maintenance of ReCord.";
    packageJson.author = "Influence";

    packageJson.build.appId = "app.record.installer";
    packageJson.build.productName = "ReCord Installer";
    packageJson.build.win ??= {};
    packageJson.build.win.artifactName = "${productName}-Windows.${ext}";
    packageJson.build.portable ??= {};
    packageJson.build.portable.requestExecutionLevel ??= "user";
    packageJson.build.portable.useZip = true;

    const distFromInstaller = toPosixPath(relative(installerDir, join(ROOT, "dist")));
    const imagesFromInstaller = toPosixPath(relative(installerDir, join(ROOT, "Images")));
    const pkgFromInstaller = toPosixPath(relative(installerDir, join(ROOT, "package.json")));

    packageJson.build.extraResources = [
        {
            from: distFromInstaller,
            to: "record-app/dist",
            filter: [
                "**/*.js",
                "**/*.css",
                "!**/*.map",
                "!**/*.LEGAL.txt"
            ]
        },
        {
            from: imagesFromInstaller,
            to: "record-app/Images",
            filter: ["**/*"]
        },
        {
            from: pkgFromInstaller,
            to: "record-app/package.json",
            filter: ["package.json"]
        }
    ];

    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf8");
}

function prepareTempInstallerDir() {
    rmSync(TEMP_INSTALLER_DIR, { force: true, recursive: true });
    execSync(`git clone --depth=1 --branch development ${UPSTREAM_INSTALLER_REPO} "${TEMP_INSTALLER_DIR}"`, {
        stdio: "inherit",
        cwd: ROOT
    });

    return TEMP_INSTALLER_DIR;
}

async function main() {
    mkdirSync(RELEASE_DIR, { recursive: true });
    const out = join(RELEASE_DIR, "ReCordSetup.exe");
    const installerDir = existsSync(INSTALLER_DIR)
        ? INSTALLER_DIR
        : prepareTempInstallerDir();

    overlayInstallerTemplate(installerDir);
    configureInstallerResources(installerDir);

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

