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
    name: "EquiBase64Encode",
    description: "Encode text to base64",
    authors: [Devs.Rloxx],
    tags: ["Chat", "Utility", "Equicord"],
    icon: EQUICORD_ICON,
    dependencies: ["CommandsAPI"],
    commands: [{
        name: "equi64encode",
        description: "Encode text to base64",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [{
            name: "text",
            description: "Text to encode",
            type: ApplicationCommandOptionType.STRING,
            required: true
        }],
        execute: (args, ctx) => {
            const text = String(findOption(args, "text", ""));
            return sendBotMessage(ctx.channel.id, { content: btoa(unescape(encodeURIComponent(text))) });
        }
    }]
});
