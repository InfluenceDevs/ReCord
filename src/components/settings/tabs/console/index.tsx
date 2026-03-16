/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { Forms, React, Text } from "@webpack/common";

type LogLevel = "log" | "warn" | "error" | "info" | "debug";

interface ReplEntry {
    type: "input" | "output" | "error";
    text: string;
    ts: number;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
    log: "var(--text-normal)",
    info: "var(--text-brand)",
    warn: "#f0b429",
    error: "#ed4245",
    debug: "var(--text-muted)"
};

function LogViewer() {
    const [, forceUpdate] = React.useReducer(n => n + 1, 0);
    const entries = (Logger as any).getHistory?.()?.slice(-300).reverse() ?? [];

    React.useEffect(() => {
        const id = setInterval(() => forceUpdate(), 1500);
        return () => clearInterval(id);
    }, []);

    return (
        <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Button size="small" variant="secondary" onClick={() => forceUpdate()}>Refresh</Button>
                <Button size="small" variant="dangerSecondary" onClick={() => {
                    (Logger as any).clearHistory?.();
                    forceUpdate();
                }}>Clear</Button>
            </div>

            <div
                style={{
                    maxHeight: 340,
                    overflowY: "auto",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    background: "var(--background-secondary)",
                    fontFamily: "monospace",
                    fontSize: 12,
                    lineHeight: 1.6
                }}
            >
                {entries.length === 0
                    ? <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>No log entries yet.</Text>
                    : entries.map((e: any, i: number) => (
                        <div key={i} style={{ marginBottom: 4 }}>
                            <span style={{ color: "var(--text-muted)" }}>[{new Date(e.ts).toLocaleTimeString()}]</span>
                            {" "}
                            <span style={{ color: LEVEL_COLORS[e.level as LogLevel] ?? "var(--text-normal)" }}>
                                [{(e.level as string).toUpperCase()}]
                            </span>
                            {" "}
                            <span style={{ color: "var(--text-brand)" }}>[{e.scope}]</span>
                            {" "}
                            <span style={{ color: "var(--text-normal)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{e.text}</span>
                        </div>
                    ))
                }
            </div>
        </div>
    );
}

function JavaScriptRepl() {
    const [input, setInput] = React.useState("");
    const [history, setHistory] = React.useState<ReplEntry[]>([]);
    const [histIdx, setHistIdx] = React.useState(-1);
    const [cmdHistory, setCmdHistory] = React.useState<string[]>([]);
    const outputRef = React.useRef<HTMLDivElement>(null);

    const scrollToBottom = React.useCallback(() => {
        const el = outputRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, []);

    const runCode = React.useCallback(() => {
        const code = input.trim();
        if (!code) return;

        const inputEntry: ReplEntry = { type: "input", text: `> ${code}`, ts: Date.now() };

        // Capture console output during eval
        const captured: string[] = [];
        const origLog = console.log.bind(console);
        const origWarn = console.warn.bind(console);
        const origError = console.error.bind(console);

        const fmt = (...args: any[]) => args.map(a => {
            try { return typeof a === "object" ? JSON.stringify(a, null, 2) : String(a); } catch { return String(a); }
        }).join(" ");

        console.log = (...args) => { captured.push("LOG: " + fmt(...args)); origLog(...args); };
        console.warn = (...args) => { captured.push("WARN: " + fmt(...args)); origWarn(...args); };
        console.error = (...args) => { captured.push("ERR: " + fmt(...args)); origError(...args); };

        let result: ReplEntry;
        try {
            const val = (0, eval)(code);
            const out = captured.length
                ? captured.join("\n") + "\n" + fmt(val)
                : fmt(val);
            result = { type: "output", text: out, ts: Date.now() };
        } catch (err: any) {
            result = { type: "error", text: String(err), ts: Date.now() };
        } finally {
            console.log = origLog;
            console.warn = origWarn;
            console.error = origError;
        }

        setHistory(prev => [...prev, inputEntry, result]);
        setCmdHistory(prev => [code, ...prev.slice(0, 99)]);
        setInput("");
        setHistIdx(-1);
        setTimeout(scrollToBottom, 50);
    }, [input, scrollToBottom]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            runCode();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const next = histIdx + 1;
            if (next < cmdHistory.length) {
                setHistIdx(next);
                setInput(cmdHistory[next]);
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = histIdx - 1;
            if (next < 0) { setHistIdx(-1); setInput(""); }
            else { setHistIdx(next); setInput(cmdHistory[next]); }
        }
    }, [runCode, histIdx, cmdHistory]);

    return (
        <div>
            <div
                ref={outputRef}
                style={{
                    height: 280,
                    overflowY: "auto",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    background: "var(--background-secondary)",
                    fontFamily: "monospace",
                    fontSize: 12,
                    lineHeight: 1.7,
                    marginBottom: 8
                }}
            >
                {history.length === 0
                    ? <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>
                        JavaScript REPL — type code and press Enter. Shift+Enter for newline.
                    </Text>
                    : history.map((e, i) => (
                        <div key={i} style={{ marginBottom: 2 }}>
                            <span
                                style={{
                                    color: e.type === "input"
                                        ? "var(--text-brand)"
                                        : e.type === "error"
                                            ? "#ed4245"
                                            : "var(--text-normal)",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-all"
                                }}
                            >
                                {e.text}
                            </span>
                        </div>
                    ))
                }
            </div>

            <div style={{ display: "flex", gap: 8 }}>
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter JavaScript..."
                    rows={2}
                    style={{
                        flex: 1,
                        resize: "vertical",
                        fontFamily: "monospace",
                        fontSize: 13,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border-subtle)",
                        background: "var(--background-secondary)",
                        color: "var(--text-normal)",
                        outline: "none"
                    }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <Button size="small" onClick={runCode}>Run</Button>
                    <Button size="small" variant="secondary" onClick={() => { setHistory([]); }}>Clear</Button>
                </div>
            </div>
            <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>
                Enter = run · Shift+Enter = newline · ↑↓ = history
            </Forms.FormText>
        </div>
    );
}

function ConsoleTab() {
    const [activeTab, setActiveTab] = React.useState<"repl" | "log">("repl");

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h2">Console</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16} style={{ color: "var(--text-muted)" }}>
                JavaScript REPL and ReCord log viewer.
            </Forms.FormText>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <Button
                    size="small"
                    variant={activeTab === "repl" ? "primary" : "secondary"}
                    onClick={() => setActiveTab("repl")}
                >
                    JavaScript REPL
                </Button>
                <Button
                    size="small"
                    variant={activeTab === "log" ? "primary" : "secondary"}
                    onClick={() => setActiveTab("log")}
                >
                    Log Viewer
                </Button>
            </div>

            {activeTab === "repl" && (
                <section>
                    <Forms.FormTitle tag="h5">JavaScript REPL</Forms.FormTitle>
                    <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                        Execute JavaScript in Discord's renderer context. Full access to Vencord APIs, webpack modules, and the DOM.
                    </Forms.FormText>
                    <JavaScriptRepl />
                </section>
            )}

            {activeTab === "log" && (
                <section>
                    <Forms.FormTitle tag="h5">ReCord Log Viewer</Forms.FormTitle>
                    <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                        Live view of recent ReCord internal log messages.
                    </Forms.FormText>
                    <LogViewer />
                </section>
            )}
        </SettingsTab>
    );
}

export default wrapTab(ConsoleTab, "Console");
