import { progress } from "../stores/installation";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";

import { log, lognewline } from "./utils/log";
import succeed from "./utils/succeed";
import fail from "./utils/fail";
import reset from "./utils/reset";
import kill from "./utils/kill";
import { showRestartNotice } from "./utils/notices";

function getCliPath() {
	const cliName = process.platform === "win32" ? "ReCordInstallerCli.exe" : "ReCordInstallerCli";
	if (process.resourcesPath) return path.join(process.resourcesPath, cliName);
	return path.join(__dirname, "..", "..", "..", "extraResources", cliName);
}

function copyDirSync(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
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
		const proc = spawn(getCliPath(), args, { stdio: "pipe", env: getCliEnv() });
		let buffered = "";
		let transcript = "";
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
				if (cleaned) {
					transcript += cleaned + "\n";
					log(cleaned);
				}
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
			if (remainder) {
				transcript += remainder + "\n";
				log(remainder);
			}
			if (code === 0) resolve();
			else {
				const err = new Error(`CLI exited with code ${code}`);
				err.output = transcript.trim();
				reject(err);
			}
		});
		proc.on("error", reject);
	});
}

function shouldRetryWithRepair(err) {
	const output = `${err?.message ?? ""}\n${err?.output ?? ""}`.toLowerCase();
	return output.includes("rename")
		&& output.includes("app.asar")
		&& output.includes("_app.asar")
		&& output.includes("cannot find the file specified");
}

function isDiscordFileLockError(err) {
	const output = `${err?.message ?? ""}\n${err?.output ?? ""}`.toLowerCase();
	return output.includes("files are used by a different process")
		|| output.includes("access is denied")
		|| output.includes("resource busy")
		|| output.includes("ep\u0065rm")
		|| output.includes("ebusy");
}

function isLockedAsarRenameError(err) {
	const output = `${err?.message ?? ""}\n${err?.output ?? ""}`.toLowerCase();
	return output.includes("rename")
		&& output.includes("_app.asar")
		&& output.includes("app.asar")
		&& output.includes("access is denied");
}

function getDiscordChannelDir(channel) {
	const map = {
		stable: "Discord",
		ptb: "DiscordPTB",
		canary: "DiscordCanary",
		development: "DiscordDevelopment"
	};

	return map[channel] || "Discord";
}

function getLatestAppDir(discordRoot) {
	const appDirs = fs.readdirSync(discordRoot, { withFileTypes: true })
		.filter(entry => entry.isDirectory() && /^app-\d+\.\d+\.\d+/.test(entry.name))
		.map(entry => entry.name);

	if (!appDirs.length) return null;

	appDirs.sort((a, b) => {
		const aMtime = fs.statSync(path.join(discordRoot, a)).mtimeMs;
		const bMtime = fs.statSync(path.join(discordRoot, b)).mtimeMs;
		return bMtime - aMtime;
	});

	return appDirs[0];
}

function normalizeLegacyAsarLayout(channel) {
	if (process.platform !== "win32") return;

	try {
		const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
		const discordRoot = path.join(localAppData, getDiscordChannelDir(channel));
		if (!fs.existsSync(discordRoot)) return;

		const appDirs = fs.readdirSync(discordRoot, { withFileTypes: true })
			.filter(entry => entry.isDirectory() && /^app-\d+\.\d+\.\d+/.test(entry.name))
			.map(entry => entry.name)
			.sort((a, b) => {
				const aMtime = fs.statSync(path.join(discordRoot, a)).mtimeMs;
				const bMtime = fs.statSync(path.join(discordRoot, b)).mtimeMs;
				return bMtime - aMtime;
			});

		const latestAppDir = appDirs[0];
		if (!latestAppDir) return;

		const resources = path.join(discordRoot, latestAppDir, "resources");
		const appAsar = path.join(resources, "app.asar");
		const fallbackAsar = path.join(resources, "_app.asar");
		const injectedAppDir = path.join(resources, "app");
		const appBspatch = path.join(resources, "app.asar.bspatch");

		if (!fs.existsSync(appAsar) && fs.existsSync(fallbackAsar)) {
			if (fs.existsSync(injectedAppDir)) {
				fs.rmSync(injectedAppDir, { recursive: true, force: true });
			}

			fs.renameSync(fallbackAsar, appAsar);
			log(`Detected legacy patched layout on ${channel}; restored app.asar before install.`);
			return;
		}

		if (!fs.existsSync(appAsar) && !fs.existsSync(fallbackAsar) && fs.existsSync(appBspatch)) {
			const candidates = [];

			for (const dir of appDirs.slice(1)) {
				candidates.push(path.join(discordRoot, dir, "resources", "_app.asar"));
			}

			for (const dir of appDirs.slice(1)) {
				const candidateApp = path.join(discordRoot, dir, "resources", "app.asar");
				try {
					if (fs.existsSync(candidateApp) && fs.statSync(candidateApp).size > 1024 * 1024) {
						candidates.push(candidateApp);
					}
				} catch {
					// Ignore candidates that disappear while Discord updates itself.
				}
			}

			for (const dir of appDirs.slice(1)) {
				try {
					const modulesDir = path.join(discordRoot, dir, "modules");
					if (!fs.existsSync(modulesDir)) continue;

					const coreModules = fs.readdirSync(modulesDir, { withFileTypes: true })
						.filter(entry => entry.isDirectory() && entry.name.startsWith("discord_desktop_core-"))
						.sort((a, b) => b.name.localeCompare(a.name));

					for (const moduleEntry of coreModules) {
						const coreAsar = path.join(modulesDir, moduleEntry.name, "discord_desktop_core", "core.asar");
						if (fs.existsSync(coreAsar) && fs.statSync(coreAsar).size > 1024 * 1024) {
							candidates.push(coreAsar);
						}
					}
				} catch {
					// Ignore modules folders that disappear while Discord updates itself.
				}
			}

			for (const candidate of candidates) {
				try {
					if (!fs.existsSync(candidate)) continue;

					if (fs.existsSync(injectedAppDir)) {
						fs.rmSync(injectedAppDir, { recursive: true, force: true });
					}

					fs.copyFileSync(candidate, appAsar);
					log(`Recovered missing app.asar on ${channel} using ${candidate}.`);
					return;
				} catch {
					// Try next candidate if this one vanished or is unreadable.
				}
			}

			log(`Warning: unable to recover app.asar for Discord ${channel}; no usable backup payload was found.`);
		}
	} catch (err) {
		log(`Warning: could not normalize Discord ${channel} layout automatically: ${err.message}`);
	}
}

function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function getLatestDiscordResourcesDir(channel) {
	if (process.platform !== "win32") return null;

	const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
	const discordRoot = path.join(localAppData, getDiscordChannelDir(channel));
	if (!fs.existsSync(discordRoot)) return null;

	const latestAppDir = getLatestAppDir(discordRoot);
	if (!latestAppDir) return null;

	const resourcesDir = path.join(discordRoot, latestAppDir, "resources");
	if (!fs.existsSync(resourcesDir)) return null;

	return resourcesDir;
}

function tryManualLockedAsarRecovery(channel) {
	try {
		const resourcesDir = getLatestDiscordResourcesDir(channel);
		if (!resourcesDir) return false;

		const fallbackAsar = path.join(resourcesDir, "_app.asar");
		const appAsar = path.join(resourcesDir, "app.asar");
		if (!fs.existsSync(fallbackAsar)) return false;

		if (!fs.existsSync(appAsar)) {
			fs.copyFileSync(fallbackAsar, appAsar);
			log(`Created app.asar copy from _app.asar for ${channel} to bypass locked rename path.`);
		}

		return true;
	} catch (err) {
		log(`Warning: manual asar recovery failed on ${channel}: ${err.message}`);
		return false;
	}
}

export default async function (config) {
	await reset();
	const channels = Object.keys(config);
	if (!channels.length) return fail();

	const progressPerChannel = 90 / channels.length;

	for (const channel of channels) {
		lognewline(`Installing ReCord on Discord ${channel}...`);
		try {
			const preKillErr = await kill([channel], 0, false);
			if (preKillErr) {
				log(`\u274c Failed to close Discord ${channel} before install: ${preKillErr.message}`);
				return fail();
			}

			normalizeLegacyAsarLayout(channel);
			await runCli(["-install", "-branch", channel]);
			log(`\u2705 ReCord installed successfully on ${channel}`);
			progress.set(progress.value + progressPerChannel);
		}
		catch (err) {
			if (isDiscordFileLockError(err)) {
				log("Discord still appears to be running. Retrying after force-closing processes...");
				const retryKillErr = await kill([channel], 0, false);
				if (retryKillErr) {
					log(`\u274c Could not close Discord ${channel}: ${retryKillErr.message}`);
					return fail();
				}

				if (isLockedAsarRenameError(err)) {
					log("Detected locked _app.asar rename path. Attempting manual asar recovery before repair...");
					tryManualLockedAsarRecovery(channel);
				}

				await wait(1800);

				if (isLockedAsarRenameError(err)) {
					try {
						normalizeLegacyAsarLayout(channel);
						await runCli(["-repair", "-branch", channel]);
						log(`\u2705 ReCord repaired successfully on ${channel} after locked-file recovery`);
						progress.set(progress.value + progressPerChannel);
						continue;
					}
					catch (repairAfterLockErr) {
						err = repairAfterLockErr;
					}
				}

				try {
					normalizeLegacyAsarLayout(channel);
					await runCli(["-install", "-branch", channel]);
					log(`\u2705 ReCord installed successfully on ${channel} after closing Discord processes`);
					progress.set(progress.value + progressPerChannel);
					continue;
				}
				catch (retryErr) {
					err = retryErr;
				}
			}

			if (shouldRetryWithRepair(err)) {
				log("Detected missing app.asar on host layout. Retrying with repair mode...");
				try {
					normalizeLegacyAsarLayout(channel);
					await runCli(["-repair", "-branch", channel]);
					log(`\u2705 ReCord repaired successfully on ${channel}`);
					progress.set(progress.value + progressPerChannel);
					continue;
				}
				catch (repairErr) {
					log(`\u274c Repair fallback failed on ${channel}: ${repairErr.message}`);
					return fail();
				}
			}

			log(`\u274c Failed to install on ${channel}: ${err.message}`);
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
