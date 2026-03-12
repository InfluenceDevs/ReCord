/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "ExampleReCordPlugin",
    description: "Template user plugin for ReCord.",
    authors: [Devs.Ven],

    start() {
        console.log("[ReCord] ExampleReCordPlugin started");
    },

    stop() {
        console.log("[ReCord] ExampleReCordPlugin stopped");
    }
});
