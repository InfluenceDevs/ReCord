/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

export default function ToneIndicator({ prefix, indicator, desc }: { prefix: string; indicator: string; desc: string; }) {
    return (
        <span
            style={{
                border: "1px solid color-mix(in srgb, var(--brand-500) 24%, transparent)",
                borderRadius: "8px",
                padding: "0 6px",
                marginLeft: "2px",
                background: "color-mix(in srgb, var(--background-secondary) 90%, #1a2f59 10%)",
                fontSize: "0.85em"
            }}
            title={desc}
        >
            {prefix}{indicator}
        </span>
    );
}
