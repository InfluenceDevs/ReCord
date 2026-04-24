import path from "path";
import findProcess from "find-process";
import kill from "tree-kill";
import {spawn} from "child_process";
import {shell} from "electron";
import {progress} from "../../stores/installation";
import {log} from "./log";

const platforms = {stable: "Discord", ptb: "Discord PTB", canary: "Discord Canary", development: "Discord Development"};
const windowsChannelDirs = {stable: "Discord", ptb: "DiscordPTB", canary: "DiscordCanary", development: "DiscordDevelopment"};

function taskkillPid(pid) {
    return new Promise(resolve => {
        const proc = spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {stdio: "ignore", windowsHide: true});
        proc.on("close", code => resolve(code === 0));
        proc.on("error", () => resolve(false));
    });
}

function taskkillImage(image) {
    return new Promise(resolve => {
        const proc = spawn("taskkill", ["/F", "/T", "/IM", image], {stdio: "ignore", windowsHide: true});
        proc.on("close", code => resolve(code === 0));
        proc.on("error", () => resolve(false));
    });
}

function getWindowsProcessImages(channel) {
    const primary = {
        stable: "Discord.exe",
        ptb: "DiscordPTB.exe",
        canary: "DiscordCanary.exe",
        development: "DiscordDevelopment.exe"
    };

    const images = [
        primary[channel],
        "Update.exe",
        "DiscordCrashHandler.exe",
        "DiscordHookHelper.exe"
    ].filter(Boolean);

    return [...new Set(images)];
}

function runPowerShell(command) {
    return new Promise(resolve => {
        const proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], {
            stdio: ["ignore", "pipe", "ignore"],
            windowsHide: true
        });

        let stdout = "";
        proc.stdout.on("data", data => {
            stdout += data.toString();
        });

        proc.on("close", () => resolve(stdout));
        proc.on("error", () => resolve(""));
    });
}

function getDiscordInstallRoot(channel) {
    if (process.platform !== "win32") return null;

    const localAppData = process.env.LOCALAPPDATA;
    const dirName = windowsChannelDirs[channel];
    if (!localAppData || !dirName) return null;

    return path.join(localAppData, dirName);
}

async function killWindowsProcessesByInstallPath(channel) {
    const installRoot = getDiscordInstallRoot(channel);
    if (!installRoot) return;

    const escapedRoot = installRoot.replace(/'/g, "''").toLowerCase();
    const script = [
        `$root = '${escapedRoot}'`,
        "Get-CimInstance Win32_Process |",
        "Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith($root) } |",
        "Select-Object -ExpandProperty ProcessId"
    ].join(" ");

    const output = await runPowerShell(script);
    const pids = output
        .split(/\r?\n/)
        .map(line => Number.parseInt(line.trim(), 10))
        .filter(pid => Number.isInteger(pid) && pid > 0 && pid !== process.pid);

    for (const pid of [...new Set(pids)]) {
        await taskkillPid(pid);
    }
}

async function findProcessMatches(processName) {
    const candidates = [processName, `${processName}.exe`];
    const matches = [];

    for (const candidate of candidates) {
        try {
            const found = await findProcess("name", candidate, true);
            if (found?.length) matches.push(...found);
        }
        catch {
            // Continue with remaining candidates if one query fails.
        }
    }

    const unique = new Map();
    for (const item of matches) unique.set(item.pid, item);
    return [...unique.values()];
}

async function killWindowsDiscordHelpers(channel) {
    if (process.platform !== "win32") return;

    for (const image of getWindowsProcessImages(channel)) {
        await taskkillImage(image);
    }

    await killWindowsProcessesByInstallPath(channel);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function killProcesses(channels, progressPerLoop, shouldRestart = true) {
    for (const channel of channels) {
        let processName = platforms[channel];
        if (!processName) {
            log(`⚠️ Unknown Discord channel '${channel}', skipping process kill.`);
            continue;
        }
        if (process.platform === "darwin") processName = platforms[channel]; // Discord Canary and Discord PTB on Mac
        else processName = platforms[channel].replace(" ", ""); // DiscordCanary and DiscordPTB on Windows/Linux

        log("Attempting to kill " + processName);
        try {
            await killWindowsDiscordHelpers(channel);

            const results = await findProcessMatches(processName);
            if (!results || !results.length) {
                log(`✅ ${processName} not running`);
                await wait(1200);
                progress.set(progress.value + progressPerLoop);
                continue;
            }

            const parentPids = results.map(p => p.ppid);
            const discordPid = results.find(p => parentPids.includes(p.pid)) || results[0];
            const bin = discordPid?.bin
                ? (process.platform === "darwin" ? path.resolve(discordPid.bin, "..", "..", "..") : discordPid.bin)
                : null;

            for (const proc of results) {
                await new Promise(r => kill(proc.pid, r));
            }

            await killWindowsDiscordHelpers(channel);
            await wait(1800);
            if (shouldRestart && bin) setTimeout(() => shell.openPath(bin), 1000);
            progress.set(progress.value + progressPerLoop);
        }
        catch (err) {
            const symbol = shouldRestart ? "⚠️" : "❌";
            log(`${symbol} Could not kill ${platforms[channel]}`);
            log(`${symbol} ${err.message}`);
            return err;
        }
    }
}
