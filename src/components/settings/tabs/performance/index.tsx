/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { Button, Forms, React, TextInput } from "@webpack/common";

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

function useStored<T>(key: string, defaultValue: T): [T, (next: T) => void] {
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

function StatCard({ title, value, hint }: { title: string; value: string; hint?: string; }) {
    return (
        <div style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            padding: "12px 14px",
            background: "var(--background-secondary)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.02) inset"
        }}>
            <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12 }}>{title}</Forms.FormText>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 2, marginBottom: 2 }}>{value}</div>
            {hint && <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 11 }}>{hint}</Forms.FormText>}
        </div>
    );
}

function ActionCard({ title, description, children }: React.PropsWithChildren<{ title: string; description: string; }>) {
    return (
        <section style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            background: "var(--background-secondary)",
            padding: 14
        }}>
            <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>{title}</Forms.FormTitle>
            <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 10 }}>{description}</Forms.FormText>
            {children}
        </section>
    );
}

function Toggle({ value, onToggle, onLabel = "Enabled", offLabel = "Disabled" }: { value: boolean; onToggle: () => void; onLabel?: string; offLabel?: string; }) {
    return (
        <Button size="small" onClick={onToggle}>
            {value ? onLabel : offLabel}
        </Button>
    );
}

function PerformanceTab() {
    const [showFpsOverlay, setShowFpsOverlay] = useStored("showFpsOverlay", false);
    const [disableAnimations, setDisableAnimations] = useStored("disableAnimations", false);
    const [reduceBlur, setReduceBlur] = useStored("reduceBlur", false);
    const [limitBackgroundFps, setLimitBackgroundFps] = useStored("limitBackgroundFps", false);
    const [resourceSampleSize, setResourceSampleSize] = useStored("resourceSampleSize", 100);
    const [pingUrl, setPingUrl] = useStored("pingUrl", "https://discord.com/api/v9/experiments");

    const [fps, setFps] = React.useState(0);
    const [memoryText, setMemoryText] = React.useState("Unavailable");
    const [webglInfo, setWebglInfo] = React.useState("Unavailable");
    const [resourceStats, setResourceStats] = React.useState("No sample yet");
    const [pingResult, setPingResult] = React.useState("Not tested");
    const [benchResult, setBenchResult] = React.useState("Not run");
    const [gcAvailable, setGcAvailable] = React.useState(false);

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
            setMemoryText("Unavailable");
            return;
        }

        const usedMb = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
        const totalMb = (mem.totalJSHeapSize / 1024 / 1024).toFixed(1);
        const limitMb = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1);
        setMemoryText(`${usedMb}MB / ${totalMb}MB (limit ${limitMb}MB)`);
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
                setWebglInfo("Renderer hidden");
                return;
            }

            const vendor = (gl as any).getParameter(ext.UNMASKED_VENDOR_WEBGL);
            const renderer = (gl as any).getParameter(ext.UNMASKED_RENDERER_WEBGL);
            setWebglInfo(`${vendor} / ${renderer}`);
        } catch {
            setWebglInfo("Query failed");
        }
    }, []);

    React.useEffect(() => {
        const id = "record-performance-style";
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
            css.push("* { backdrop-filter: none !important; }");
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
                return window.setTimeout(() => cb(perfNowSafe()), 125) as unknown as number;
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
            setResourceStats("No resource entries");
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
            await fetch(pingUrl, { cache: "no-store" });
            setPingResult(`${(perfNowSafe() - start).toFixed(1)}ms`);
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
        setBenchResult(`${(perfNowSafe() - start).toFixed(1)}ms (${acc.toFixed(1)})`);
    }, []);

    const runGcHint = React.useCallback(() => {
        try {
            (window as any).gc?.();
            setGcAvailable(true);
        } catch {
            setGcAvailable(false);
        }
    }, []);

    const hardwareInfo = `${navigator.hardwareConcurrency ?? "?"} threads · ${((navigator as any).deviceMemory ?? "?")}GB memory hint`;

    return (
        <SettingsTab>
            <div style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: 14,
                background: "linear-gradient(145deg, var(--background-secondary), var(--background-tertiary))",
                padding: 16,
                marginBottom: 16
            }}>
                <Forms.FormTitle tag="h2" style={{ marginBottom: 4 }}>Performance Dashboard</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)" }}>
                    Real-time diagnostics and optimization controls for renderer responsiveness, memory, and network performance.
                </Forms.FormText>
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", marginBottom: 16 }}>
                <StatCard title="FPS" value={showFpsOverlay ? String(fps) : "OFF"} hint="Enable FPS overlay below" />
                <StatCard title="Heap" value={memoryText} hint="Chromium memory API" />
                <StatCard title="GPU" value={webglInfo} hint="WebGL renderer info" />
                <StatCard title="Hardware" value={hardwareInfo} hint="Browser-reported capability" />
                <StatCard title="Ping" value={pingResult} hint="Custom endpoint latency" />
                <StatCard title="Bench" value={benchResult} hint="CPU micro benchmark" />
            </div>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                <ActionCard
                    title="Visual Load"
                    description="Reduce expensive visual effects and transition overhead."
                >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Toggle value={disableAnimations} onToggle={() => setDisableAnimations(!disableAnimations)} onLabel="Animations OFF" offLabel="Disable Animations" />
                        <Toggle value={reduceBlur} onToggle={() => setReduceBlur(!reduceBlur)} onLabel="Blur Reduction ON" offLabel="Reduce Blur" />
                    </div>
                </ActionCard>

                <ActionCard
                    title="Frame Scheduling"
                    description="Control frame behavior when Discord is not focused."
                >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Toggle value={showFpsOverlay} onToggle={() => setShowFpsOverlay(!showFpsOverlay)} onLabel="FPS Overlay ON" offLabel="Enable FPS Overlay" />
                        <Toggle value={limitBackgroundFps} onToggle={() => setLimitBackgroundFps(!limitBackgroundFps)} onLabel="Limiter ON (8 FPS)" offLabel="Background FPS Limiter" />
                    </div>
                </ActionCard>

                <ActionCard
                    title="Network Probe"
                    description="Ping any endpoint and profile resource timing."
                >
                    <div style={{ display: "grid", gap: 8 }}>
                        <TextInput value={pingUrl} onChange={v => setPingUrl(v)} placeholder="Ping URL" />
                        <div style={{ display: "flex", gap: 8 }}>
                            <Button size="small" onClick={runPing}>Ping</Button>
                            <Button size="small" onClick={runResourceSample}>Resource Sample</Button>
                        </div>
                        <TextInput
                            value={String(resourceSampleSize)}
                            onChange={v => setResourceSampleSize(Math.max(10, Number(v) || 100))}
                            placeholder="Resource sample size"
                        />
                        <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12 }}>{resourceStats}</Forms.FormText>
                    </div>
                </ActionCard>

                <ActionCard
                    title="Runtime Bench"
                    description="Measure CPU throughput and trigger GC if available."
                >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Button size="small" onClick={runBench}>Run CPU Bench</Button>
                        <Button size="small" onClick={runGcHint}>Try GC</Button>
                    </div>
                    <Forms.FormText className={Margins.top8} style={{ color: gcAvailable ? "var(--text-positive)" : "var(--text-muted)" }}>
                        {gcAvailable ? "GC hint sent (runtime exposes gc)." : "GC API unavailable."}
                    </Forms.FormText>
                </ActionCard>
            </div>
        </SettingsTab>
    );
}

export default wrapTab(PerformanceTab, "Performance");
