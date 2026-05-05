import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { brotliDecompressSync, gunzipSync } from "zlib";

const searches = [
    ".buildLayout().map",
    "SEARCH_NO_RESULTS&&0===",
    "getWebUserSettingFromSection",
    "COPY_VERSION",
    "buildLayout",
    "$Root",
    "SIDEBAR_ITEM",
    "useSearchTerms",
];

const dirs = [
    process.env.APPDATA + "/discord/Cache/Cache_Data",
    process.env.APPDATA + "/discord/Code Cache/js",
    process.env.APPDATA + "/discord/Service Worker/ScriptCache",
];

const largeFiles = [];
for (const dir of dirs) {
    try {
        const files = readdirSync(dir).map(f => join(dir, f));
        for (const f of files) {
            try {
                const size = statSync(f).size;
                if (size > 50000) largeFiles.push(f);
            } catch { }
        }
    } catch { }
}

console.log(`Scanning ${largeFiles.length} files...`);

const results = {};
for (const s of searches) results[s] = [];

function maybeSearchText(text, sourceName) {
    for (const s of searches) {
        if (text.includes(s)) {
            results[s].push(sourceName);
        }
    }
}

function scanEmbeddedGzip(buf, sourceName) {
    for (let i = 0; i < buf.length - 2; i++) {
        if (buf[i] === 0x1f && buf[i + 1] === 0x8b) {
            try {
                const out = gunzipSync(buf.subarray(i));
                maybeSearchText(out.toString("utf8"), `${sourceName}#gzip@${i}`);
            } catch { }
        }
    }
}

for (const fpath of largeFiles) {
    try {
        const shortName = fpath.replace(/.*[\\/]/, "");
        const buf = readFileSync(fpath);

        // Plain-text pass (works for some cache entries)
        maybeSearchText(buf.toString("utf8"), shortName);

        // Entire-buffer compression pass
        try {
            maybeSearchText(gunzipSync(buf).toString("utf8"), `${shortName}#gunzip`);
        } catch { }
        try {
            maybeSearchText(brotliDecompressSync(buf).toString("utf8"), `${shortName}#brotli`);
        } catch { }

        // Embedded compression pass for HTTP cache records
        scanEmbeddedGzip(buf, shortName);
    } catch {}
}

for (const s of searches) {
    if (results[s].length > 0) {
        console.log(`FOUND "${s}" in: ${results[s].join(", ")}`);
    } else {
        console.log(`NOT FOUND: "${s}"`);
    }
}
