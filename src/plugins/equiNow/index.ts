/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const EQUICORD_ICON = "https://github.com/Equicord/Equibored/blob/main/icons/equicord/icon.png?raw=1";

export default definePlugin({
    name: "EquiNow",
    description: "Send current time and unix timestamp",
    authors: [Devs.Rloxx],
    tags: ["Chat", "Utility", "Equicord"],
    icon: EQUICORD_ICON,
    dependencies: ["CommandsAPI"],
    commands: [{
        name: "equinow",
        description: "Send current local time + unix",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_, ctx) => {
            const now = new Date();
            const unix = Math.floor(now.getTime() / 1000);
            return sendBotMessage(ctx.channel.id, { content: `Now: ${now.toLocaleString()} | Unix: ${unix}` });
        }
    }]
});
