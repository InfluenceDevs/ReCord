/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { Button, Forms, React, Text, TextInput } from "@webpack/common";

const STORE_KEY = "record_perf_settings";

function readStore(): Record<string, any> {
    try {
        return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    } catch {
        return {};
    }
}

function writeStore(value: Record<string, any>) {
    localStorage.setItem(STORE_KEY, JSON.stringify(value));
}

function useStoredSetting<T>(key: string, defaultValue: T): [T, (next: T) => void] {
    const [value, setValue] = React.useState<T>(() => {
        const store = readStore();
        return key in store ? store[key] : defaultValue;
    });

    const update = React.useCallback((next: T) => {
        setValue(next);
        const store = readStore();
        store[key] = next;
        writeStore(store);
    }, [key]);

    return [value, update];
}

function perfNowSafe() {
    return performance?.now?.() ?? Date.now();
}

function PerformanceTab() {
    const [showFpsOverlay, setShowFpsOverlay] = useStoredSetting("showFpsOverlay", false);
    const [disableAnimations, setDisableAnimations] = useStoredSetting("disableAnimations", false);
    const [reduceBlur, setReduceBlur] = useStoredSetting("reduceBlur", false);
    const [limitBackgroundFps, setLimitBackgroundFps] = useStoredSetting("limitBackgroundFps", false);
    const [gcHintEnabled, setGcHintEnabled] = useStoredSetting("gcHintEnabled", false);
    const [resourceSampleSize, setResourceSampleSize] = useStoredSetting("resourceSampleSize", 100);
    const [pingUrl, setPingUrl] = useStoredSetting("pingUrl", "https://discord.com/api/v9/experiments");

    const [fps, setFps] = React.useState(0);
    const [memoryText, setMemoryText] = React.useState("Unavailable");
    const [webglInfo, setWebglInfo] = React.useState("Unavailable");
    const [resourceStats, setResourceStats] = React.useState("No sample yet");
    const [pingResult, setPingResult] = React.useState("Not tested");
    const [benchResult, setBenchResult] = React.useState("Not run");

    const fpsRef = React.useRef({ frames: 0, last: perfNowSafe() });

    React.useEffect(() => {
        if (!showFpsOverlay) return;

        let raf = 0;

        const tick = () => {
            const now = perfNowSafe();
            const state = fpsRef.current;
            state.frames += 1;

            if (now - state.last >= 1000) {
                setFps(Math.round((state.frames * 1000) / (now - state.last)));
                state.frames = 0;
                state.last = now;
            }

            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [showFpsOverlay]);

    React.useEffect(() => {
        const mem = (performance as any)?.memory;
        if (!mem) {
            setMemoryText("Unavailable (Chromium memory API not exposed)");
            return;
        }

        const usedMb = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
        const totalMb = (mem.totalJSHeapSize / 1024 / 1024).toFixed(1);
        const limitMb = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1);
        setMemoryText(`${usedMb}MB used / ${totalMb}MB total (limit ${limitMb}MB)`);
    }, [showFpsOverlay, disableAnimations, reduceBlur, limitBackgroundFps]);

    React.useEffect(() => {
        try {
            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
            if (!gl) {
                setWebglInfo("WebGL unavailable");
                return;
            }
            const ext = (gl as any).getExtension("WEBGL_debug_renderer_info");
            if (!ext) {
                setWebglInfo("Renderer info hidden by browser");
                return;
            }
            const renderer = (gl as any).getParameter(ext.UNMASKED_RENDERER_WEBGL);
            const vendor = (gl as any).getParameter(ext.UNMASKED_VENDOR_WEBGL);
            setWebglInfo(`${vendor} / ${renderer}`);
        } catch {
            setWebglInfo("Unable to query renderer");
        }
    }, []);

    React.useEffect(() => {
        const id = "record-perf-style";
        const existing = document.getElementById(id) as HTMLStyleElement | null;
        const style = existing ?? (() => {
            const el = document.createElement("style");
            el.id = id;
            document.head.appendChild(el);
            return el;
        })();

        const css: string[] = [];
        if (disableAnimations) {
            css.push("*, *::before, *::after { animation: none !important; transition: none !important; }");
        }
        if (reduceBlur) {
            css.push("* { backdrop-filter: none !important; filter: none !important; }");
        }

        style.textContent = css.join("\n");

        return () => {
            if (!disableAnimations && !reduceBlur) style.remove();
        };
    }, [disableAnimations, reduceBlur]);

    React.useEffect(() => {
        if (!limitBackgroundFps) return;

        const originalRaf = window.requestAnimationFrame.bind(window);
        const wrapped = (cb: FrameRequestCallback) => {
            if (!document.hasFocus()) {
                return window.setTimeout(() => cb(perfNowSafe()), 1000 / 8) as unknown as number;
            }
            return originalRaf(cb);
        };

        (window as any).__recordPerfRaf = originalRaf;
        window.requestAnimationFrame = wrapped as typeof requestAnimationFrame;

        return () => {
            if ((window as any).__recordPerfRaf) {
                window.requestAnimationFrame = (window as any).__recordPerfRaf;
                delete (window as any).__recordPerfRaf;
            }
        };
    }, [limitBackgroundFps]);

    const runResourceSample = React.useCallback(() => {
        const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        if (!entries.length) {
            setResourceStats("No resource timing entries");
            return;
        }

        const sample = entries.slice(Math.max(0, entries.length - resourceSampleSize));
        const totalMs = sample.reduce((acc, e) => acc + (e.duration || 0), 0);
        const avg = totalMs / sample.length;
        const max = Math.max(...sample.map(e => e.duration || 0));
        setResourceStats(`${sample.length} entries | avg ${avg.toFixed(1)}ms | max ${max.toFixed(1)}ms`);
    }, [resourceSampleSize]);

    const runPing = React.useCallback(async () => {
        const start = perfNowSafe();
        try {
            await fetch(pingUrl, { cache: "no-store", method: "GET" });
            const ms = perfNowSafe() - start;
            setPingResult(`${ms.toFixed(1)}ms`);
        } catch (err: any) {
            setPingResult(`Error: ${err?.message ?? "request failed"}`);
        }
    }, [pingUrl]);

    const runBench = React.useCallback(() => {
        const count = 1_500_000;
        const start = perfNowSafe();
        let acc = 0;
        for (let i = 0; i < count; i++) {
            acc += Math.sqrt(i) * Math.sin(i % 360);
        }
        const elapsed = perfNowSafe() - start;
        setBenchResult(`${elapsed.toFixed(1)}ms for ${count.toLocaleString()} ops (${acc.toFixed(1)})`);
    }, []);

    const gcHint = React.useCallback(() => {
        try {
            (window as any).gc?.();
            setGcHintEnabled(true);
        } catch {
            setGcHintEnabled(false);
        }
    }, [setGcHintEnabled]);

    const deviceInfo = `${navigator.hardwareConcurrency ?? "?"} threads | ${((navigator as any).deviceMemory ?? "?")}GB RAM hint`;

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h2">Performance</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16} style={{ color: "var(--text-muted)" }}>
                Performance controls and diagnostics for renderer speed, memory usage, network latency, and UI load.
            </Forms.FormText>

            <Forms.FormTitle tag="h5">1. FPS Overlay</Forms.FormTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Button size="small" onClick={() => setShowFpsOverlay(!showFpsOverlay)}>
                    {showFpsOverlay ? "Disable" : "Enable"}
                </Button>
                <Text variant="text-sm/normal">Current FPS: {showFpsOverlay ? fps : "OFF"}</Text>
            </div>

            <Forms.FormTitle tag="h5">2. Disable UI Animations</Forms.FormTitle>
            <div style={{ marginBottom: 10 }}>
                <Button size="small" onClick={() => setDisableAnimations(!disableAnimations)}>
                    {disableAnimations ? "Enabled" : "Disabled"}
                </Button>
            </div>

            <Forms.FormTitle tag="h5">3. Reduce Blur/Filters</Forms.FormTitle>
            <div style={{ marginBottom: 10 }}>
                <Button size="small" onClick={() => setReduceBlur(!reduceBlur)}>
                    {reduceBlur ? "Enabled" : "Disabled"}
                </Button>
            </div>

            <Forms.FormTitle tag="h5">4. Background FPS Limiter</Forms.FormTitle>
            <div style={{ marginBottom: 10 }}>
                <Button size="small" onClick={() => setLimitBackgroundFps(!limitBackgroundFps)}>
                    {limitBackgroundFps ? "Enabled (8 FPS unfocused)" : "Disabled"}
                </Button>
            </div>

            <Forms.FormTitle tag="h5">5. JS Heap Monitor</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8}>{memoryText}</Forms.FormText>

            <Forms.FormTitle tag="h5">6. Device Capability Summary</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8}>{deviceInfo}</Forms.FormText>

            <Forms.FormTitle tag="h5">7. GPU / WebGL Renderer</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8}>{webglInfo}</Forms.FormText>

            <Forms.FormTitle tag="h5">8. Resource Timing Sampler</Forms.FormTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <TextInput value={String(resourceSampleSize)} onChange={v => setResourceSampleSize(Math.max(10, Number(v) || 100))} placeholder="Sample size" />
                <Button size="small" onClick={runResourceSample}>Sample</Button>
            </div>
            <Forms.FormText className={Margins.bottom8}>{resourceStats}</Forms.FormText>

            <Forms.FormTitle tag="h5">9. Network Ping Check</Forms.FormTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <TextInput value={pingUrl} onChange={v => setPingUrl(v)} placeholder="Ping URL" />
                <Button size="small" onClick={runPing}>Ping</Button>
            </div>
            <Forms.FormText className={Margins.bottom8}>Result: {pingResult}</Forms.FormText>

            <Forms.FormTitle tag="h5">10. CPU Micro-Benchmark</Forms.FormTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Button size="small" onClick={runBench}>Run Bench</Button>
                <Forms.FormText>{benchResult}</Forms.FormText>
            </div>

            <Forms.FormTitle tag="h5">11. GC Hint</Forms.FormTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Button size="small" onClick={gcHint}>Try GC</Button>
                <Forms.FormText style={{ color: gcHintEnabled ? "var(--text-positive)" : "var(--text-muted)" }}>
                    {gcHintEnabled ? "GC hint sent (if available)." : "GC API unavailable in this runtime."}
                </Forms.FormText>
            </div>
        </SettingsTab>
    );
}

export default wrapTab(PerformanceTab, "Performance");
