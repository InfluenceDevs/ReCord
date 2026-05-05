/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const EQUICORD_ICON = "https://github.com/Equicord/Equibored/blob/main/icons/equicord/icon.png?raw=1";

export default definePlugin({
    name: "EquiWordCount",
    description: "Count words and characters in text",
    authors: [Devs.Rloxx],
    tags: ["Chat", "Utility", "Equicord"],
    icon: EQUICORD_ICON,
    dependencies: ["CommandsAPI"],
    commands: [{
        name: "equiwordcount",
        description: "Count words/chars in text",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [{
            name: "text",
            description: "Text to analyze",
            type: ApplicationCommandOptionType.STRING,
            required: true
        }],
        execute: (args, ctx) => {
            const text = String(findOption(args, "text", ""));
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            return sendBotMessage(ctx.channel.id, { content: `Words: ${words} | Characters: ${text.length}` });
        }
    }]
});
