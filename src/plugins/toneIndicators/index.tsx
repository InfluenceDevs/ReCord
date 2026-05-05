/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";
import { ReactNode } from "react";

import indicatorsDefault from "./indicators";
import ToneIndicator from "./ToneIndicator";

const EQUICORD_ICON = "https://github.com/Equicord/Equibored/blob/main/icons/equicord/icon.png?raw=1";

const settings = definePluginSettings({
    prefix: {
        type: OptionType.STRING,
        description: "Prefix character(s) for tone indicators.",
        default: "/",
    },
    customIndicators: {
        type: OptionType.STRING,
        description: "Custom indicators (format: jk=Joking; srs=Serious)",
        default: "",
    },
});

function getCustomIndicators(): Record<string, string> {
    const raw = settings.store.customIndicators || "";
    const result: Record<string, string> = {};

    raw.split(";").forEach(entry => {
        const [key, ...rest] = entry.split("=");
        if (key && rest.length > 0) result[key.trim().toLowerCase()] = rest.join("=").trim();
    });

    return result;
}

function getIndicator(text: string): string | null {
    const normalized = text.toLowerCase();
    const custom = getCustomIndicators();

    return custom[normalized]
        || custom[`_${normalized}`]
        || indicatorsDefault.get(normalized)
        || indicatorsDefault.get(`_${normalized}`)
        || null;
}

function buildIndicatorRegex(): RegExp {
    const custom = getCustomIndicators();
    const allIndicators = new Set<string>();

    indicatorsDefault.forEach((_, key) => allIndicators.add(key.replace(/^_/, "")));
    Object.keys(custom).forEach(key => allIndicators.add(key.replace(/^_/, "")));

    const escaped = Array.from(allIndicators)
        .map(ind => ind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .sort((a, b) => b.length - a.length);

    const prefix = settings.store.prefix || "/";
    let escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isMarkdown = /[*_~`|]/.test(prefix);
    if (isMarkdown) escapedPrefix = `(?:\\\\${escapedPrefix}|${escapedPrefix})`;

    return new RegExp(`(?:^|\\s)${escapedPrefix}(${escaped.join("|")})(?=\\s|$|[^\\s\\w/])`, "giu");
}

function splitTextWithIndicators(text: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    const regex = buildIndicatorRegex();
    const prefix = settings.store.prefix || "/";

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text))) {
        const indicator = match[1];
        const desc = getIndicator(indicator);
        const fullMatch = match[0];
        const leadingWhitespace = fullMatch.match(/^(\s*)/)?.[1] ?? "";

        const matchStart = match.index;
        const matchEnd = regex.lastIndex;

        if (matchStart > lastIndex) nodes.push(text.slice(lastIndex, matchStart));

        if (desc) {
            if (leadingWhitespace) nodes.push(leadingWhitespace);
            nodes.push(
                <ToneIndicator
                    key={`ti-${matchStart}`}
                    prefix={prefix}
                    indicator={indicator}
                    desc={desc}
                />
            );
        }

        lastIndex = matchEnd;
    }

    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
}

function patchChildrenTree(children: any): any {
    const transform = (node: any): any => {
        if (node == null) return node;

        if (typeof node === "string") {
            const prefix = settings.store.prefix || "/";
            let escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (/[*_~`|]/.test(prefix)) escapedPrefix = `(?:\\\\${escapedPrefix}|${escapedPrefix})`;

            if (!new RegExp(`${escapedPrefix}[\\p{L}_]+`, "iu").test(node)) return node;
            const parts = splitTextWithIndicators(node);
            return parts.length === 1 ? parts[0] : parts;
        }

        if (node?.props?.children != null) {
            const c = node.props.children;
            node.props.children = Array.isArray(c) ? c.map(transform).flat() : transform(c);
            return node;
        }

        return node;
    };

    return Array.isArray(children) ? children.map(transform).flat() : transform(children);
}

export default definePlugin({
    name: "ToneIndicators",
    description: "Show tooltips for tone indicators like /srs, /gen, etc.",
    tags: ["Chat", "Utility", "Equicord"],
    authors: [Devs.Rloxx],
    icon: EQUICORD_ICON,
    settings,

    patches: [
        {
            find: '["strong","em","u","text","inlineCode","s","spoiler"]',
            replacement: {
                match: /(?=return\{hasSpoilerEmbeds:\i,.{0,15}content:(\i))/,
                replace: "$1=$self.patchToneIndicators($1);",
            }
        },
    ],

    patchToneIndicators(content: any): any {
        try {
            return patchChildrenTree(content);
        } catch {
            return content;
        }
    },
});
