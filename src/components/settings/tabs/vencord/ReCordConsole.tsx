/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Logger } from "@utils/Logger";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Forms, React, Text } from "@webpack/common";

function ReCordConsole() {
    const [, forceUpdate] = React.useReducer(n => n + 1, 0);
    const entries = Logger.getHistory().slice(-200).reverse();

    React.useEffect(() => {
        const id = setInterval(() => forceUpdate(), 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
                <Button size="small" variant="secondary" onClick={() => forceUpdate()}>
                    Refresh
                </Button>
                <Button size="small" variant="dangerSecondary" onClick={() => {
                    Logger.clearHistory();
                    forceUpdate();
                }}>
                    Clear
                </Button>
            </div>

            <Forms.FormText>
                ReCord log console (latest 200 entries)
            </Forms.FormText>

            <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 8 }}>
                {entries.length === 0 && (
                    <Text variant="text-sm/normal">No logs yet.</Text>
                )}
                {entries.map((e, i) => (
                    <div key={i} style={{ marginBottom: 8, fontFamily: "monospace", fontSize: 12, lineHeight: 1.4 }}>
                        <span style={{ color: "var(--text-muted)" }}>[{new Date(e.ts).toLocaleTimeString()}]</span>{" "}
                        <span style={{ color: "var(--text-normal)" }}>[{e.level.toUpperCase()}]</span>{" "}
                        <span style={{ color: "var(--text-brand)" }}>[{e.scope}]</span>{" "}
                        <span>{e.text}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function openReCordConsoleModal() {
    openModal(props => (
        <ModalRoot {...props} size={ModalSize.DYNAMIC}>
            <ModalHeader>
                <Text variant="heading-lg/semibold" style={{ flexGrow: 1 }}>ReCord Console</Text>
                <ModalCloseButton onClick={props.onClose} />
            </ModalHeader>

            <ModalContent>
                <ReCordConsole />
            </ModalContent>
        </ModalRoot>
    ));
}
