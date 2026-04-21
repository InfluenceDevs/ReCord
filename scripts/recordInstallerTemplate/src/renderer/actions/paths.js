const fs = require("fs");
const path = require("path");
const os = require("os");
import {remote} from "electron";

export const platforms = {stable: "Discord", ptb: "Discord PTB", canary: "Discord Canary"};
export const locations = {stable: "", ptb: "", canary: ""};

// Map channel key -> folder name used by Discord installer
const channelDirNames = {
    stable: "Discord",
    ptb: "DiscordPTB",
    canary: "DiscordCanary"
};

const getDiscordBasePath = function(channel) {
    try {
        const dirName = channelDirNames[channel];
        if (process.platform === "win32") {
            const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
            const candidate = path.join(localAppData, dirName);
            if (fs.existsSync(candidate)) return candidate;
            // Atypical location: ProgramData\%username%\Discord*
            const programData = process.env.PROGRAMDATA;
            const username = process.env.USERNAME || os.userInfo().username;
            if (programData && username) {
                const alt = path.join(programData, username, dirName);
                if (fs.existsSync(alt)) return alt;
            }
            return "";
        }
        else {
            // macOS / Linux — use app.getPath("home") equivalent
            let basedir = "";
            if (process.platform === "darwin") {
                basedir = path.join(os.homedir(), "Library", "Application Support", dirName.toLowerCase());
            }
            else {
                basedir = path.join(os.homedir(), ".config", dirName.toLowerCase());
            }
            if (fs.existsSync(basedir)) return basedir;
            return "";
        }
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return "";
    }
};

for (const channel in platforms) {
    locations[channel] = getDiscordBasePath(channel);
}

export const getBrowsePath = function(channel) {
    if (process.platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
        return path.join(localAppData, channelDirNames[channel]);
    }
    if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", channelDirNames[channel].toLowerCase());
    return path.join(os.homedir(), ".config", channelDirNames[channel].toLowerCase());
};

export const validatePath = function(channel, proposedPath) {
    if (!proposedPath || !fs.existsSync(proposedPath)) return "";
    const dirName = channelDirNames[channel];
    // Accept if user picked the base Discord dir or a parent containing it
    const base = path.basename(proposedPath);
    if (base === dirName) return proposedPath;
    // If they picked a parent dir that contains the channel folder
    const child = path.join(proposedPath, dirName);
    if (fs.existsSync(child)) return child;
    // Accept as-is if it at least exists (CLI handles actual resolution)
    return proposedPath;
};

