/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DATA_DIR } from "@main/utils/constants";
import { shell } from "electron";
import { mkdirSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { extname, join, normalize } from "path";

const BD_PLUGINS_DIR = join(DATA_DIR, "bdplugins");
mkdirSync(BD_PLUGINS_DIR, { recursive: true });

function ensureSafePath(basePath: string, path: string) {
    const normalizedBasePath = normalize(basePath + "/");
    const normalizedPath = normalize(join(basePath, path));
    return normalizedPath.startsWith(normalizedBasePath) ? normalizedPath : null;
}

export function getPluginsDir() {
    return BD_PLUGINS_DIR;
}

export function openPluginsDir() {
    return shell.openPath(BD_PLUGINS_DIR);
}

export async function listPluginFiles() {
    const files = await readdir(BD_PLUGINS_DIR).catch(() => []);
    return files.filter(f => extname(f).toLowerCase() === ".js" || f.toLowerCase().endsWith(".plugin.js"));
}

export async function readPluginFile(_, fileName: string) {
    const safePath = ensureSafePath(BD_PLUGINS_DIR, fileName);
    if (!safePath) return null;

    return readFile(safePath, "utf-8").catch(() => null);
}
