/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { ipcMain } from "electron";
import { writeFile } from "fs/promises";
import { join } from "path";

import gitHash from "~git-hash";

import { serializeErrors, VENCORD_FILES, VERSION } from "./common";

const RECORD_REMOTE = "InfluenceDevs/ReCord";
const API_BASE = `https://api.github.com/repos/${RECORD_REMOTE}`;
const DEFAULT_BRANCH = "main";
const DEVBUILD_TAG = "devbuild";
let PendingUpdates = [] as [string, string][];

interface UpdateEntry {
    hash: string;
    author: string;
    message: string;
}

interface GithubReleaseAsset {
    name: string;
    browser_download_url: string;
}

interface GithubRelease {
    tag_name: string;
    assets: GithubReleaseAsset[];
}

function parseSemver(version: string) {
    const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/i);
    if (!match) return null;

    return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function compareSemver(a: string, b: string) {
    const va = parseSemver(a);
    const vb = parseSemver(b);
    if (!va || !vb) return 0;

    for (let i = 0; i < 3; i++) {
        if (va[i] > vb[i]) return 1;
        if (va[i] < vb[i]) return -1;
    }

    return 0;
}

async function githubGet<T = any>(endpoint: string) {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/vnd.github+json",
            // "All API requests MUST include a valid User-Agent header.
            // Requests with no User-Agent header will be rejected."
            "User-Agent": VENCORD_USER_AGENT
        }
    });
}

function setPendingUpdates(assets: GithubReleaseAsset[] = []) {
    PendingUpdates = [];

    assets.forEach(({ name, browser_download_url }) => {
        if (VENCORD_FILES.some(s => name.startsWith(s))) {
            PendingUpdates.push([name, browser_download_url]);
        }
    });

    return PendingUpdates.length > 0;
}

async function getRelease(tag = "latest") {
    if (tag === "latest") {
        return githubGet<GithubRelease>("/releases/latest");
    }

    return githubGet<GithubRelease>(`/releases/tags/${tag}`);
}

async function tryGetMainBranchUpdate() {
    if (!gitHash) return null;

    const [headCommit, devbuildRelease] = await Promise.all([
        githubGet<any>(`/commits/${DEFAULT_BRANCH}`),
        getRelease(DEVBUILD_TAG).catch(() => null)
    ]);

    const headSha = headCommit?.sha as string | undefined;
    if (!headSha || headSha.startsWith(gitHash)) {
        return {
            hasUpdate: false,
            entries: [] as UpdateEntry[]
        };
    }

    const comparison = await githubGet<any>(`/compare/${gitHash}...${headSha}`).catch(() => null);
    if (!comparison || comparison.status !== "behind") {
        return null;
    }

    const hasAssets = setPendingUpdates(devbuildRelease?.assets ?? []);
    if (!hasAssets) {
        PendingUpdates = [];
        return null;
    }

    return {
        hasUpdate: true,
        entries: (comparison.commits ?? []).map((c: any) => ({
            hash: c.sha.slice(0, 7),
            author: c.author?.login ?? c.commit?.author?.name ?? "ReCord",
            message: c.commit?.message?.split("\n")[0] ?? "Update available"
        })) as UpdateEntry[]
    };
}

async function tryGetLatestReleaseUpdate() {
    const latestRelease = await getRelease("latest");
    const latestTag = latestRelease.tag_name as string;
    const semverCmp = compareSemver(VERSION, latestTag);

    if (!gitHash) {
        if (semverCmp >= 0) return [] as UpdateEntry[];

        if (!setPendingUpdates(latestRelease.assets)) return [] as UpdateEntry[];

        return [{
            hash: latestTag,
            author: "ReCord",
            message: `Update available: ${latestTag}`
        }];
    }

    let comparison: any;
    try {
        comparison = await githubGet(`/compare/${gitHash}...${latestTag}`);
    } catch {
        if (semverCmp >= 0) return [] as UpdateEntry[];

        if (!setPendingUpdates(latestRelease.assets)) return [] as UpdateEntry[];

        return [{
            hash: latestTag,
            author: "ReCord",
            message: `Update available: ${latestTag}`
        }];
    }

    if (comparison?.status !== "behind") {
        if (semverCmp >= 0) return [] as UpdateEntry[];

        if (!setPendingUpdates(latestRelease.assets)) return [] as UpdateEntry[];

        return [{
            hash: latestTag,
            author: "ReCord",
            message: `Update available: ${latestTag}`
        }];
    }

    if (!setPendingUpdates(latestRelease.assets)) return [] as UpdateEntry[];

    return (comparison.commits ?? []).map((c: any) => ({
        hash: c.sha.slice(0, 7),
        author: c.author?.login ?? c.commit?.author?.name ?? "ReCord",
        message: c.commit?.message.split("\n")[0]
    }));
}

async function calculateGitChanges() {
    PendingUpdates = [];

    const mainBranchUpdate = await tryGetMainBranchUpdate().catch(() => null);
    if (mainBranchUpdate?.hasUpdate) {
        return mainBranchUpdate.entries;
    }

    return tryGetLatestReleaseUpdate();
}

async function fetchUpdates() {
    PendingUpdates = [];

    const mainBranchUpdate = await tryGetMainBranchUpdate().catch(() => null);
    if (mainBranchUpdate?.hasUpdate) {
        return PendingUpdates.length > 0;
    }

    const releaseUpdates = await tryGetLatestReleaseUpdate();
    return releaseUpdates.length > 0 && PendingUpdates.length > 0;
}

async function applyUpdates() {
    const fileContents = await Promise.all(PendingUpdates.map(async ([name, url]) => {
        const contents = await fetchBuffer(url);
        return [join(__dirname, name), contents] as const;
    }));

    await Promise.all(fileContents.map(async ([filename, contents]) =>
        writeFile(filename, contents))
    );

    PendingUpdates = [];
    return true;
}

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => `https://github.com/${RECORD_REMOTE}`));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(calculateGitChanges));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(applyUpdates));
