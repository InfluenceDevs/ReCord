/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const EQUICORD_ICON = "https://github.com/Equicord/Equibored/blob/main/icons/equicord/icon.png?raw=1";

function mockify(text: string) {
    return [...text].map((c, i) => i % 2 ? c.toLowerCase() : c.toUpperCase()).join("");
}

export default definePlugin({
    name: "EquiMockText",
    description: "Convert text to alternating mock case",
    authors: [Devs.Rloxx],
    tags: ["Chat", "Fun", "Equicord"],
    icon: EQUICORD_ICON,
    dependencies: ["CommandsAPI"],
    commands: [{
        name: "equimock",
        description: "Mockify the given text",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [{
            name: "text",
            description: "Text to mockify",
            type: ApplicationCommandOptionType.STRING,
            required: true
        }],
        execute: (args, ctx) => {
            const text = String(findOption(args, "text", ""));
            return sendBotMessage(ctx.channel.id, { content: mockify(text) });
        }
    }]
});
