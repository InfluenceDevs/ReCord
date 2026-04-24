import path from "path";
import findProcess from "find-process";
import kill from "tree-kill";
import {spawn} from "child_process";
import {shell} from "electron";
import {progress} from "../../stores/installation";
import {log} from "./log";

const platforms = {stable: "Discord", ptb: "Discord PTB", canary: "Discord Canary", development: "Discord Development"};

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

async function killWindowsDiscordHelpers(channel) {
    if (process.platform !== "win32") return;

    for (const image of getWindowsProcessImages(channel)) {
        await taskkillImage(image);
    }
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

            const results = await findProcess("name", processName, true);
            if (!results || !results.length) {
                log(`✅ ${processName} not running`);
                await wait(600);
                progress.set(progress.value + progressPerLoop);
                continue;
            }

            const parentPids = results.map(p => p.ppid);
            const discordPid = results.find(p => parentPids.includes(p.pid)) || results[0];
            const bin = discordPid?.bin
                ? (process.platform === "darwin" ? path.resolve(discordPid.bin, "..", "..", "..") : discordPid.bin)
                : null;
            await new Promise(r => kill(discordPid.pid, r));
            await killWindowsDiscordHelpers(channel);
            await wait(900);
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
