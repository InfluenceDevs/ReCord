import {progress} from "../stores/installation";
import path from "path";
import fs from "fs";
import os from "os";
import {spawn} from "child_process";

import {log, lognewline} from "./utils/log";
import succeed from "./utils/succeed";
import fail from "./utils/fail";
import reset from "./utils/reset";
import kill from "./utils/kill";
import {showRestartNotice} from "./utils/notices";

function getCliPath() {
    const cliName = process.platform === "win32" ? "ReCordInstallerCli.exe" : "ReCordInstallerCli";
    if (process.resourcesPath) return path.join(process.resourcesPath, cliName);
    return path.join(__dirname, "..", "..", "..", "extraResources", cliName);
}

function copyDirSync(src, dest) {
    fs.mkdirSync(dest, {recursive: true});
    for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirSync(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
}

function hasRecordPayload(dir) {
    if (!dir || !fs.existsSync(dir)) return false;
    return fs.existsSync(path.join(dir, "dist")) && fs.existsSync(path.join(dir, "package.json"));
}

function resolveRecordAppSource() {
    const resourcesPath = process.resourcesPath || "";
    const candidates = [
        path.join(resourcesPath, "record-app"),
        path.join(resourcesPath, "app.asar.unpacked", "record-app"),
        path.join(path.dirname(process.execPath), "resources", "record-app"),
        path.join(path.dirname(process.execPath), "resources", "app.asar.unpacked", "record-app"),
        path.join(__dirname, "..", "..", "..", "extraResources", "record-app")
    ];

    return candidates.find(hasRecordPayload) || null;
}

function getCliEnv() {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    const persistentPath = path.join(appData, "ReCord");
    const source = resolveRecordAppSource();

    if (source) {
        copyDirSync(source, persistentPath);
    } else if (!hasRecordPayload(persistentPath)) {
        throw new Error("Installer payload (record-app) could not be found in extracted resources.");
    }

    return {
        ...process.env,
        RECORD_USER_DATA_DIR: persistentPath,
        RECORD_DEV_INSTALL: "1",
        RECORD_FORCE_BRAND: "1",
        VENCORD_USER_DATA_DIR: persistentPath,
        VENCORD_DEV_INSTALL: "1"
    };
}

function runCli(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(getCliPath(), args, {stdio: "pipe", env: getCliEnv()});
        let buffered = "";
        const sanitize = text => text
            .replace(/BetterDiscord/gi, "ReCord")
            .replace(/Vencord/gi, "ReCord")
            .replace(/\x1b\[[0-9;]*m/g, "");

        const handleOutput = d => {
            buffered += d.toString();
            const lines = buffered.split(/\r?\n/);
            buffered = lines.pop() || "";

            for (const line of lines) {
                const cleaned = sanitize(line).trim();
                if (cleaned) log(cleaned);
            }

            if (/press\s+enter\s+to\s+exit/i.test(sanitize(buffered))) {
                try { proc.stdin.write("\n"); }
                catch {
                    // ignore stdin write errors if process is already closing
                }
            }
        };

        proc.stdout.on("data", handleOutput);
        proc.stderr.on("data", handleOutput);
        proc.on("close", code => {
            const remainder = sanitize(buffered).trim();
            if (remainder) log(remainder);
            if (code === 0) resolve();
            else reject(new Error(`CLI exited with code ${code}`));
        });
        proc.on("error", reject);
    });
}

export default async function(config) {
    await reset();
    const channels = Object.keys(config);
    if (!channels.length) return fail();

    const progressPerChannel = 90 / channels.length;

    for (const channel of channels) {
        lognewline(`Repairing ReCord on Discord ${channel}...`);
        try {
            const preKillErr = await kill([channel], 0, false);
            if (preKillErr) {
                log(`\u274c Failed to close Discord ${channel} before repair: ${preKillErr.message}`);
                return fail();
            }

            await runCli(["-repair", "-branch", channel]);
            log(`\u2705 ReCord repaired successfully on ${channel}`);
            progress.set(progress.value + progressPerChannel);
        }
        catch (err) {
            log(`\u274c Failed to repair on ${channel}: ${err.message}`);
            return fail();
        }
    }

    lognewline("Restarting Discord...");
    const killErr = await kill(channels, (100 - progress.value) / channels.length);
    if (killErr) showRestartNotice();
    else log("\u2705 Discord restarted");
    progress.set(100);

    succeed();
};
