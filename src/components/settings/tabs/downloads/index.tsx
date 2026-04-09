/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Button } from "@components/Button";
import { Margins } from "@utils/margins";
import { Forms, React, Text } from "@webpack/common";

const HISTORY_KEY = "record_download_history";

type Entry = {
    ts: number;
    url: string;
    fileName: string;
    source: "anchor" | "external";
};

function readHistory(): Entry[] {
    try {
        const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function DownloadHistoryTab() {
    const [items, setItems] = React.useState<Entry[]>(() => readHistory());

    const refresh = React.useCallback(() => setItems(readHistory()), []);

    React.useEffect(() => {
        const id = setInterval(refresh, 2000);
        return () => clearInterval(id);
    }, [refresh]);

    const clear = React.useCallback(() => {
        localStorage.removeItem(HISTORY_KEY);
        setItems([]);
    }, []);

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h2">Download History</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16} style={{ color: "var(--text-muted)" }}>
                Tracks downloaded attachments and externally-opened download links.
            </Forms.FormText>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <Button size="small" onClick={refresh}>Refresh</Button>
                <Button size="small" variant="dangerSecondary" onClick={clear}>Clear</Button>
            </div>

            {items.length === 0 && (
                <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>
                    No downloads logged yet.
                </Text>
            )}

            <div style={{ display: "grid", gap: 8 }}>
                {items.map((entry, i) => (
                    <div
                        key={`${entry.ts}-${i}`}
                        style={{
                            border: "1px solid var(--border-subtle)",
                            borderRadius: 10,
                            padding: "10px 12px",
                            background: "var(--background-secondary)"
                        }}
                    >
                        <Forms.FormText style={{ fontWeight: 600 }}>{entry.fileName || "file"}</Forms.FormText>
                        <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12 }}>
                            {new Date(entry.ts).toLocaleString()} · {entry.source}
                        </Forms.FormText>
                        <Forms.FormText style={{ marginTop: 6, wordBreak: "break-all", fontSize: 12 }}>{entry.url}</Forms.FormText>

                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <Button size="small" onClick={() => window.open(entry.url, "_blank", "noopener,noreferrer")}>Open</Button>
                            <Button size="small" variant="secondary" onClick={() => navigator.clipboard.writeText(entry.url)}>Copy URL</Button>
                        </div>
                    </div>
                ))}
            </div>
        </SettingsTab>
    );
}

export default wrapTab(DownloadHistoryTab, "Download History");
