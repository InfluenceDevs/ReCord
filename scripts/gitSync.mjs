import "./checkNodeVersion.js";

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
    execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

function getVersionTag() {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    return `v${pkg.version}`;
}

function parseArgs(argv) {
    const args = { message: "", tag: "", noTag: false };

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];

        if ((a === "-m" || a === "--message") && argv[i + 1]) {
            args.message = argv[++i];
            continue;
        }

        if ((a === "-t" || a === "--tag") && argv[i + 1]) {
            args.tag = argv[++i];
            continue;
        }

        if (a === "--no-tag") {
            args.noTag = true;
            continue;
        }

        if (!a.startsWith("-") && !args.message) {
            args.message = a;
        }
    }

    return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.message) {
    console.error("Usage: pnpm gitSync -- --message \"your commit message\" [--tag vX.Y.Z] [--no-tag]");
    process.exit(1);
}

const tag = args.noTag ? "" : (args.tag || getVersionTag());

run("git add -A");
run(`git commit -m \"${args.message.replace(/\"/g, '\\\"')}\"`);

if (tag) {
    run(`git tag ${tag}`);
    run(`git push origin main ${tag}`);
} else {
    run("git push origin main");
}
