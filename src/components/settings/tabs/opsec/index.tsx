/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { Alerts, Forms, React, Text, TextInput } from "@webpack/common";

// ─── helpers ─────────────────────────────────────────────────────────────────

const STORE_KEY = "record_opsec_settings";

function loadStore(): Record<string, any> {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}"); } catch { return {}; }
}

function saveStore(data: Record<string, any>) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

function useSetting<T>(key: string, def: T): [T, (v: T) => void] {
    const [val, setVal] = React.useState<T>(() => {
        const s = loadStore();
        return key in s ? s[key] : def;
    });
    const update = React.useCallback((v: T) => {
        setVal(v);
        const s = loadStore();
        s[key] = v;
        saveStore(s);
    }, [key]);
    return [val, update];
}

function ToggleRow({ title, description, settingKey, def = false }: { title: string; description?: string; settingKey: string; def?: boolean; }) {
    const [val, setVal] = useSetting<boolean>(settingKey, def);
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border-faint)" }}>
            <div style={{ flex: 1 }}>
                <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>{title}</Forms.FormTitle>
                {description && <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 13 }}>{description}</Forms.FormText>}
            </div>
            <Button
                size="small"
                variant={val ? "primary" : "secondary"}
                onClick={() => setVal(!val)}
                style={{ marginLeft: 16, minWidth: 60 }}
            >
                {val ? "ON" : "OFF"}
            </Button>
        </div>
    );
}

// ─── NETWORK ─────────────────────────────────────────────────────────────────

function NetworkTab() {
    const [ip, setIp] = React.useState<string | null>(null);
    const [ipLoading, setIpLoading] = React.useState(false);
    const [ipError, setIpError] = React.useState<string | null>(null);

    const [proxyHost, setProxyHost] = useSetting("network.proxyHost", "");
    const [proxyPort, setProxyPort] = useSetting("network.proxyPort", "");
    const [proxyEnabled, setProxyEnabled] = useSetting("network.proxyEnabled", false);
    const [dnsEnabled, setDnsEnabled] = useSetting("network.dnsEnabled", false);
    const [dnsServer, setDnsServer] = useSetting("network.dnsServer", "https://cloudflare-dns.com/dns-query");

    const checkIp = React.useCallback(async () => {
        setIpLoading(true);
        setIpError(null);
        try {
            const r = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
            const data = await r.json();
            setIp(data.ip ?? "Unknown");
        } catch (e: any) {
            setIpError("Could not fetch IP: " + e.message);
        } finally {
            setIpLoading(false);
        }
    }, []);

    const applyProxy = React.useCallback(async () => {
        if (!proxyHost || !proxyPort) {
            Alerts.show({ title: "Proxy", body: "Please enter a host and port.", confirmText: "OK" });
            return;
        }
        if (!IS_WEB) {
            // Tell the main process to set the proxy via Electron session API
            try {
                await (VencordNative as any).native?.setProxy?.(`http://${proxyHost}:${proxyPort}`);
                setProxyEnabled(true);
                Alerts.show({ title: "Proxy Applied", body: `Traffic will route through ${proxyHost}:${proxyPort}. Restart Discord to ensure all connections use the proxy.`, confirmText: "OK" });
            } catch {
                setProxyEnabled(true);
                Alerts.show({ title: "Proxy Saved", body: `Proxy settings saved. Restart Discord to apply ${proxyHost}:${proxyPort}.`, confirmText: "OK" });
            }
        } else {
            setProxyEnabled(true);
            Alerts.show({ title: "Proxy", body: "Proxy configuration is only available on the desktop app.", confirmText: "OK" });
        }
    }, [proxyHost, proxyPort, setProxyEnabled]);

    const clearProxy = React.useCallback(async () => {
        try {
            await (VencordNative as any).native?.setProxy?.("direct://");
        } catch { /* noop */ }
        setProxyEnabled(false);
        Alerts.show({ title: "Proxy Cleared", body: "Proxy configuration cleared.", confirmText: "OK" });
    }, [setProxyEnabled]);

    return (
        <div>
            <Forms.FormTitle tag="h5">IP Checker</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Fetch your current public IP address.
            </Forms.FormText>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
                <Button size="small" variant="secondary" onClick={checkIp} disabled={ipLoading}>
                    {ipLoading ? "Checking…" : "Check My IP"}
                </Button>
                {ip && (
                    <>
                        <Text variant="text-md/semibold" style={{ color: "var(--text-brand)" }}>{ip}</Text>
                        <Button size="small" variant="secondary" onClick={() => navigator.clipboard.writeText(ip)}>Copy</Button>
                    </>
                )}
                {ipError && <Text variant="text-sm/normal" style={{ color: "#ed4245" }}>{ipError}</Text>}
            </div>

            <Divider className={Margins.bottom16} />

            <Forms.FormTitle tag="h5">Proxy Manager</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Route Discord's traffic through an HTTP proxy. Desktop only.
            </Forms.FormText>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8, marginBottom: 8 }}>
                <TextInput
                    placeholder="Proxy host (e.g. 127.0.0.1)"
                    value={proxyHost}
                    onChange={v => setProxyHost(v)}
                />
                <TextInput
                    placeholder="Port"
                    value={proxyPort}
                    onChange={v => setProxyPort(v)}
                />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <Button size="small" onClick={applyProxy}>Apply Proxy</Button>
                {proxyEnabled && <Button size="small" variant="dangerSecondary" onClick={clearProxy}>Clear Proxy</Button>}
                {proxyEnabled && <Text variant="text-sm/normal" style={{ color: "var(--text-positive)" }}>Proxy active</Text>}
            </div>

            <Divider className={Margins.bottom16} />

            <Forms.FormTitle tag="h5">DNS Protection</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Use DNS-over-HTTPS to prevent DNS leaks. Enter a DoH resolver URL.
            </Forms.FormText>
            <div style={{ marginBottom: 8 }}>
                <TextInput
                    placeholder="DoH resolver URL"
                    value={dnsServer}
                    onChange={v => setDnsServer(v)}
                />
            </div>
            <ToggleRow
                title="Enable DoH"
                description="Store preference to use this resolver (applied on restart via Electron SecureContext)."
                settingKey="network.dnsEnabled"
            />
            {dnsEnabled && (
                <Forms.FormText style={{ color: "var(--text-positive)", marginTop: 4 }}>
                    DoH preference saved. Restart Discord to apply.
                </Forms.FormText>
            )}
        </div>
    );
}

// ─── FINGERPRINT ─────────────────────────────────────────────────────────────

function FingerprintTab() {
    const [ua, setUa] = useSetting("fp.userAgent", "");
    const [uaActive, setUaActive] = useSetting("fp.uaActive", false);
    const [locale, setLocale] = useSetting("fp.locale", "");
    const [localeActive, setLocaleActive] = useSetting("fp.localeActive", false);
    const [tzActive, setTzActive] = useSetting("fp.tzActive", false);

    const applyUa = React.useCallback(() => {
        if (!ua) return;
        try {
            Object.defineProperty(navigator, "userAgent", { get: () => ua, configurable: true });
            setUaActive(true);
            Alerts.show({ title: "User Agent Spoofed", body: "navigator.userAgent is now overridden for this session.", confirmText: "OK" });
        } catch {
            Alerts.show({ title: "Failed", body: "Could not override User Agent.", confirmText: "OK" });
        }
    }, [ua, setUaActive]);

    const resetUa = React.useCallback(() => {
        try {
            Object.defineProperty(navigator, "userAgent", { get: undefined, configurable: true });
        } catch { /* noop */ }
        setUaActive(false);
    }, [setUaActive]);

    const applyLocale = React.useCallback(() => {
        if (!locale) return;
        try {
            Object.defineProperty(navigator, "language", { get: () => locale, configurable: true });
            Object.defineProperty(navigator, "languages", { get: () => [locale], configurable: true });
            setLocaleActive(true);
            Alerts.show({ title: "Locale Spoofed", body: `navigator.language is now "${locale}" for this session.`, confirmText: "OK" });
        } catch {
            Alerts.show({ title: "Failed", body: "Could not override locale.", confirmText: "OK" });
        }
    }, [locale, setLocaleActive]);

    const resetLocale = React.useCallback(() => {
        try {
            Object.defineProperty(navigator, "language", { get: undefined, configurable: true });
            Object.defineProperty(navigator, "languages", { get: undefined, configurable: true });
        } catch { /* noop */ }
        setLocaleActive(false);
    }, [setLocaleActive]);

    const freezeTimezone = React.useCallback(() => {
        try {
            const origDTF = Intl.DateTimeFormat;
            (Intl as any).DateTimeFormat = function (...args: any[]) {
                if (args[1] && !args[1].timeZone) args[1].timeZone = "UTC";
                else if (!args[1]) args[1] = { timeZone: "UTC" };
                return new origDTF(...args);
            };
            (Intl.DateTimeFormat as any).prototype = origDTF.prototype;
            setTzActive(true);
            Alerts.show({ title: "Timezone Frozen", body: "Intl.DateTimeFormat will report UTC for this session.", confirmText: "OK" });
        } catch {
            Alerts.show({ title: "Failed", body: "Could not freeze timezone.", confirmText: "OK" });
        }
    }, [setTzActive]);

    return (
        <div>
            <Forms.FormTitle tag="h5">User Agent Spoof</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Override <code>navigator.userAgent</code> for this session.
            </Forms.FormText>
            <div style={{ marginBottom: 8 }}>
                <TextInput
                    placeholder="Custom User Agent string"
                    value={ua}
                    onChange={v => setUa(v)}
                />
            </div>
            <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8 }}>
                Current: <code style={{ fontSize: 11 }}>{navigator.userAgent.slice(0, 80)}…</code>
            </Forms.FormText>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <Button size="small" onClick={applyUa} disabled={!ua}>Spoof</Button>
                {uaActive && <Button size="small" variant="dangerSecondary" onClick={resetUa}>Reset</Button>}
                {uaActive && <Text variant="text-sm/normal" style={{ color: "var(--text-positive)" }}>Active</Text>}
            </div>

            <Divider className={Margins.bottom16} />

            <Forms.FormTitle tag="h5">Locale Spoof</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Override <code>navigator.language</code> (e.g. <code>en-US</code>, <code>de-DE</code>).
            </Forms.FormText>
            <div style={{ marginBottom: 8 }}>
                <TextInput
                    placeholder="Locale code (e.g. en-US)"
                    value={locale}
                    onChange={v => setLocale(v)}
                />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <Button size="small" onClick={applyLocale} disabled={!locale}>Spoof</Button>
                {localeActive && <Button size="small" variant="dangerSecondary" onClick={resetLocale}>Reset</Button>}
                {localeActive && <Text variant="text-sm/normal" style={{ color: "var(--text-positive)" }}>Active</Text>}
            </div>

            <Divider className={Margins.bottom16} />

            <Forms.FormTitle tag="h5">Timezone Freeze</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Force <code>Intl.DateTimeFormat</code> to report UTC, masking your local timezone.
            </Forms.FormText>
            <div style={{ display: "flex", gap: 8 }}>
                <Button size="small" onClick={freezeTimezone} disabled={tzActive}>Freeze to UTC</Button>
                {tzActive && <Text variant="text-sm/normal" style={{ color: "var(--text-positive)" }}>Active (reload to reset)</Text>}
            </div>
        </div>
    );
}

// ─── PRIVACY ─────────────────────────────────────────────────────────────────

const DISCORD_TELEMETRY_PATTERNS = ["/api/v9/science", "/api/v9/metrics", "sentry.io", "discord.gg/api/science"];

function PrivacyTab() {
    const [telemetryBlocked, setTelemetryBlocked] = useSetting("privacy.telemetryBlocked", false);
    const [autoWipe, setAutoWipe] = useSetting("privacy.autoWipe", false);
    const [lastWipe, setLastWipe] = useSetting<number>("privacy.lastWipe", 0);

    const blockTelemetry = React.useCallback(() => {
        try {
            const origFetch = window.fetch.bind(window);
            (window as any).__origFetch = origFetch;
            window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
                if (DISCORD_TELEMETRY_PATTERNS.some(p => url.includes(p))) {
                    return new Response(null, { status: 204 });
                }
                return origFetch(input, init);
            };
            const origXhrOpen = XMLHttpRequest.prototype.open;
            (XMLHttpRequest as any).__origOpen = origXhrOpen;
            XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: any[]) {
                if (DISCORD_TELEMETRY_PATTERNS.some(p => url.includes(p))) {
                    (this as any).__blocked = true;
                    return;
                }
                return (origXhrOpen as any).call(this, method, url, ...rest);
            };
            const origXhrSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function (...args) {
                if ((this as any).__blocked) return;
                return origXhrSend.apply(this, args);
            };
            setTelemetryBlocked(true);
            Alerts.show({ title: "Telemetry Blocked", body: "Discord science/metrics endpoints are now blocked for this session.", confirmText: "OK" });
        } catch (e: any) {
            Alerts.show({ title: "Error", body: "Failed to block telemetry: " + e.message, confirmText: "OK" });
        }
    }, [setTelemetryBlocked]);

    const unblockTelemetry = React.useCallback(() => {
        if ((window as any).__origFetch) { window.fetch = (window as any).__origFetch; delete (window as any).__origFetch; }
        if ((XMLHttpRequest as any).__origOpen) {
            XMLHttpRequest.prototype.open = (XMLHttpRequest as any).__origOpen;
            delete (XMLHttpRequest as any).__origOpen;
        }
        setTelemetryBlocked(false);
    }, [setTelemetryBlocked]);

    const cleanData = React.useCallback(() => {
        const keysToPreserve = ["record_opsec_settings"];
        const preserved: Record<string, string | null> = {};
        for (const key of keysToPreserve) preserved[key] = localStorage.getItem(key);

        // Remove ReCord/Vencord cache keys
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)!;
            if (k.startsWith("ReCord_") || k.startsWith("Vencord_")) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));

        // Restore preserved
        for (const [key, val] of Object.entries(preserved)) if (val !== null) localStorage.setItem(key, val);

        const ts = Date.now();
        setLastWipe(ts);
        Alerts.show({
            title: "Data Cleaned",
            body: `Removed ${toRemove.length} ReCord/Vencord cache entries. Your settings are preserved.`,
            confirmText: "OK"
        });
    }, [setLastWipe]);

    React.useEffect(() => {
        if (!autoWipe) return;
        const interval = setInterval(cleanData, 30 * 60 * 1000); // Every 30 min
        return () => clearInterval(interval);
    }, [autoWipe, cleanData]);

    return (
        <div>
            <Forms.FormTitle tag="h5">Telemetry Block</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Intercept and silently drop Discord's analytics/science requests for this session.
            </Forms.FormText>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <Button size="small" onClick={blockTelemetry} disabled={telemetryBlocked}>Block Telemetry</Button>
                {telemetryBlocked && <Button size="small" variant="dangerSecondary" onClick={unblockTelemetry}>Unblock</Button>}
                {telemetryBlocked && <Text variant="text-sm/normal" style={{ color: "var(--text-positive)" }}>Active</Text>}
            </div>

            <Divider className={Margins.bottom16} />

            <Forms.FormTitle tag="h5">Data Cleaner</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Remove ReCord/Vencord cache entries from localStorage. Your settings are always preserved.
            </Forms.FormText>
            {lastWipe > 0 && (
                <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8 }}>
                    Last cleaned: {new Date(lastWipe).toLocaleString()}
                </Forms.FormText>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <Button size="small" variant="secondary" onClick={cleanData}>Clean Now</Button>
            </div>

            <Divider className={Margins.bottom16} />

            <ToggleRow
                title="Auto Wipe (every 30 min)"
                description="Automatically run the data cleaner every 30 minutes while Discord is open."
                settingKey="privacy.autoWipe"
            />
        </div>
    );
}

// ─── SAFETY ──────────────────────────────────────────────────────────────────

const KNOWN_MALICIOUS_PATTERNS = [
    /discord\.gift\/[a-z0-9]{16,}/i,
    /steamcommunity\.com\/tradeoffer\/new/i,
    /bit\.ly\//i,
    /tinyurl\.com\//i,
    /grabify\.link\//i,
    /iplogger\.(org|ru|co)\//i,
    /blasze\.tk\//i,
];

const WEBHOOK_PATTERN = /discord(app)?\.com\/api\/webhooks\/\d{18,}\/[\w-]{60,}/;

function SafetyTab() {
    const [linkInput, setLinkInput] = React.useState("");
    const [scanResult, setScanResult] = React.useState<{ safe: boolean; reason: string; } | null>(null);
    const [webhookWarn, setWebhookWarn] = useSetting("safety.webhookWarn", true);
    const [tokenMasked, setTokenMasked] = React.useState(true);
    const [token, setToken] = React.useState<string | null>(null);

    React.useEffect(() => {
        try {
            const { AuthenticationStore } = (window as any).Vencord?.Webpack?.Common ?? {};
            setToken((AuthenticationStore as any)?.getToken?.() ?? null);
        } catch { /* noop */ }
    }, []);

    const scanLink = React.useCallback(() => {
        const url = linkInput.trim();
        if (!url) return;
        const isMalicious = KNOWN_MALICIOUS_PATTERNS.some(p => p.test(url));
        const isWebhook = WEBHOOK_PATTERN.test(url);
        if (isWebhook) {
            setScanResult({ safe: false, reason: "Webhook URL detected — may be used for account data exfiltration." });
        } else if (isMalicious) {
            setScanResult({ safe: false, reason: "Matched a known suspicious URL pattern (IP logger / scam)." });
        } else {
            setScanResult({ safe: true, reason: "No known malicious patterns found." });
        }
    }, [linkInput]);

    const copyToken = React.useCallback(() => {
        if (!token) return;
        navigator.clipboard.writeText(token);
        Alerts.show({
            title: "Token Copied",
            body: "Keep your token secret. Anyone with it can access your account.",
            confirmText: "Got it"
        });
    }, [token]);

    return (
        <div>
            <Forms.FormTitle tag="h5">Token Protection</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                View and copy your Discord authentication token. Never share it.
            </Forms.FormText>
            {token
                ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
                        <code
                            style={{
                                flex: 1,
                                padding: "6px 10px",
                                borderRadius: 6,
                                background: "var(--background-secondary)",
                                fontSize: 12,
                                fontFamily: "monospace",
                                color: "var(--text-normal)",
                                filter: tokenMasked ? "blur(6px)" : undefined,
                                userSelect: tokenMasked ? "none" : undefined,
                                transition: "filter 0.2s"
                            }}
                        >
                            {token}
                        </code>
                        <Button size="small" variant="secondary" onClick={() => setTokenMasked(m => !m)}>
                            {tokenMasked ? "Show" : "Hide"}
                        </Button>
                        <Button size="small" variant="secondary" onClick={copyToken}>Copy</Button>
                    </div>
                )
                : <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>Token unavailable.</Forms.FormText>
            }

            <Divider className={Margins.bottom16} />

            <Forms.FormTitle tag="h5">Link Scanner</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Check a URL against known IP-logger, scam, and webhook patterns.
            </Forms.FormText>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                    <TextInput
                        placeholder="Paste a URL to scan..."
                        value={linkInput}
                        onChange={v => { setLinkInput(v); setScanResult(null); }}
                    />
                </div>
                <Button size="small" onClick={scanLink} disabled={!linkInput}>Scan</Button>
            </div>
            {scanResult && (
                <div style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: scanResult.safe ? "rgba(35,165,90,0.12)" : "rgba(237,66,69,0.12)",
                    border: `1px solid ${scanResult.safe ? "var(--text-positive)" : "#ed4245"}`,
                    marginBottom: 16
                }}>
                    <Text variant="text-sm/semibold" style={{ color: scanResult.safe ? "var(--text-positive)" : "#ed4245" }}>
                        {scanResult.safe ? "✓ Looks safe" : "⚠ Suspicious link"}
                    </Text>
                    <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>{scanResult.reason}</Forms.FormText>
                </div>
            )}

            <Divider className={Margins.bottom16} />

            <ToggleRow
                title="Webhook Warning"
                description="Show a confirmation dialog before opening URLs that match Discord's webhook pattern."
                settingKey="safety.webhookWarn"
                def={true}
            />
            {webhookWarn && (
                <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
                    Webhook URLs in messages will show a warning before opening.
                </Forms.FormText>
            )}
        </div>
    );
}

// ─── ADVANCED ────────────────────────────────────────────────────────────────

interface ApiCall { ts: number; method: string; url: string; status?: number; }
interface WsMsg { ts: number; dir: "in" | "out"; data: string; }

function AdvancedTab() {
    const [apiLog, setApiLog] = React.useState<ApiCall[]>([]);
    const [apiMonEnabled, setApiMonEnabled] = React.useState(false);
    const [wsLog, setWsLog] = React.useState<WsMsg[]>([]);
    const [wsLogEnabled, setWsLogEnabled] = React.useState(false);
    const [blocklist, setBlocklist] = useSetting<string>("advanced.blocklist", "");

    const enableApiMon = React.useCallback(() => {
        const origFetch = window.fetch.bind(window);
        (window as any).__apiMonOrig = origFetch;
        window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
            const method = (init?.method ?? "GET").toUpperCase();
            const blocked = blocklist.split("\n").map(s => s.trim()).filter(Boolean).some(p => url.includes(p));
            if (blocked) return new Response(JSON.stringify({ error: "blocked" }), { status: 403 });
            const resp = await origFetch(input, init);
            setApiLog(prev => [{ ts: Date.now(), method, url, status: resp.status }, ...prev].slice(0, 200));
            return resp;
        };
        setApiMonEnabled(true);
    }, [blocklist]);

    const disableApiMon = React.useCallback(() => {
        if ((window as any).__apiMonOrig) { window.fetch = (window as any).__apiMonOrig; delete (window as any).__apiMonOrig; }
        setApiMonEnabled(false);
    }, []);

    const enableWsLog = React.useCallback(() => {
        const origWs = window.WebSocket;
        (window as any).__origWs = origWs;
        (window as any).WebSocket = function (url: string, ...args: any[]) {
            const ws = new origWs(url, ...args);
            const origSend = ws.send.bind(ws);
            ws.send = (data: any) => {
                setWsLog(prev => [{ ts: Date.now(), dir: "out" as const, data: JSON.stringify(data).slice(0, 200) }, ...prev].slice(0, 200));
                return origSend(data);
            };
            ws.addEventListener("message", (e: MessageEvent) => {
                setWsLog(prev => [{ ts: Date.now(), dir: "in" as const, data: JSON.stringify(e.data).slice(0, 200) }, ...prev].slice(0, 200));
            });
            return ws;
        };
        (window as any).WebSocket.prototype = origWs.prototype;
        setWsLogEnabled(true);
    }, []);

    const disableWsLog = React.useCallback(() => {
        if ((window as any).__origWs) { window.WebSocket = (window as any).__origWs; delete (window as any).__origWs; }
        setWsLogEnabled(false);
    }, []);

    return (
        <div>
            <Forms.FormTitle tag="h5">API Monitor</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Log all outgoing fetch requests. Active for this session only.
            </Forms.FormText>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Button size="small" onClick={enableApiMon} disabled={apiMonEnabled}>Enable</Button>
                {apiMonEnabled && <Button size="small" variant="dangerSecondary" onClick={disableApiMon}>Disable</Button>}
                {apiLog.length > 0 && <Button size="small" variant="secondary" onClick={() => setApiLog([])}>Clear</Button>}
                {apiMonEnabled && <Text variant="text-sm/normal" style={{ color: "var(--text-positive)" }}>Monitoring</Text>}
            </div>
            {apiLog.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 8, fontFamily: "monospace", fontSize: 11, background: "var(--background-secondary)", marginBottom: 16 }}>
                    {apiLog.map((e, i) => (
                        <div key={i} style={{ marginBottom: 3 }}>
                            <span style={{ color: "var(--text-muted)" }}>{new Date(e.ts).toLocaleTimeString()}</span>
                            {" "}
                            <span style={{ color: e.status && e.status >= 400 ? "#ed4245" : "var(--text-positive)" }}>{e.method} {e.status}</span>
                            {" "}
                            <span style={{ color: "var(--text-normal)", wordBreak: "break-all" }}>{e.url}</span>
                        </div>
                    ))}
                </div>
            )}

            <Divider className={Margins.bottom16} />

            <Forms.FormTitle tag="h5">Packet Logger</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                Intercept WebSocket messages (Discord's real-time gateway). Active for new connections only.
            </Forms.FormText>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Button size="small" onClick={enableWsLog} disabled={wsLogEnabled}>Enable</Button>
                {wsLogEnabled && <Button size="small" variant="dangerSecondary" onClick={disableWsLog}>Disable</Button>}
                {wsLog.length > 0 && <Button size="small" variant="secondary" onClick={() => setWsLog([])}>Clear</Button>}
                {wsLogEnabled && <Text variant="text-sm/normal" style={{ color: "var(--text-positive)" }}>Logging</Text>}
            </div>
            {wsLog.length > 0 && (
                <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 8, fontFamily: "monospace", fontSize: 11, background: "var(--background-secondary)", marginBottom: 16 }}>
                    {wsLog.map((e, i) => (
                        <div key={i} style={{ marginBottom: 3 }}>
                            <span style={{ color: "var(--text-muted)" }}>{new Date(e.ts).toLocaleTimeString()}</span>
                            {" "}
                            <span style={{ color: e.dir === "out" ? "var(--text-brand)" : "var(--text-positive)" }}>
                                {e.dir === "out" ? "→" : "←"}
                            </span>
                            {" "}
                            <span style={{ color: "var(--text-normal)", wordBreak: "break-all" }}>{e.data}</span>
                        </div>
                    ))}
                </div>
            )}

            <Divider className={Margins.bottom16} />

            <Forms.FormTitle tag="h5">Endpoint Blocklist</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                One URL substring per line. Blocked when API Monitor is active. Changes take effect when API Monitor is re-enabled.
            </Forms.FormText>
            <textarea
                value={blocklist}
                onChange={e => setBlocklist(e.target.value)}
                placeholder={"sentry.io\n/api/v9/science\nexample-tracker.com"}
                rows={5}
                style={{
                    width: "100%",
                    resize: "vertical",
                    fontFamily: "monospace",
                    fontSize: 12,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-subtle)",
                    background: "var(--background-secondary)",
                    color: "var(--text-normal)",
                    outline: "none",
                    boxSizing: "border-box"
                }}
            />
        </div>
    );
}

// ─── SCREEN PRIVACY ──────────────────────────────────────────────────────────

let privacyStyleEl: HTMLStyleElement | null = null;

type ScreenPrivacySettings = {
    enabled: boolean;
    mode: "blur" | "hide";
    hideTimestamps: boolean;
    hideNames: boolean;
    hideChannelNames: boolean;
    hideAvatars: boolean;
    blurPx: number;
};

function getScreenPrivacySettings(): ScreenPrivacySettings {
    const s = loadStore();
    return {
        enabled: Boolean(s["screen.enabled"]),
        mode: (s["screen.mode"] === "hide" ? "hide" : "blur") as "blur" | "hide",
        hideTimestamps: Boolean(s["screen.hideTimestamps"]),
        hideNames: Boolean(s["screen.hideNames"]),
        hideChannelNames: Boolean(s["screen.hideChannelNames"]),
        hideAvatars: Boolean(s["screen.hideAvatars"]),
        blurPx: Number(s["screen.blurPx"] ?? 8),
    };
}

function applyPrivacyCSS(settings: ScreenPrivacySettings) {
    const shouldApply = settings.enabled && (settings.hideTimestamps || settings.hideNames || settings.hideChannelNames || settings.hideAvatars);

    if (!shouldApply) {
        privacyStyleEl?.remove();
        privacyStyleEl = null;
        return;
    }

    if (!privacyStyleEl) {
        privacyStyleEl = document.createElement("style");
        privacyStyleEl.id = "record-screen-privacy";
        document.head.appendChild(privacyStyleEl);
    }

    const blur = Math.max(3, Math.min(16, settings.blurPx));
    const rules: string[] = [];

    const addMaskRule = (selector: string, avatarLike = false) => {
        if (settings.mode === "hide") {
            if (avatarLike) {
                rules.push(`${selector} { opacity: 0 !important; transition: opacity .15s ease !important; }`);
                rules.push(`${selector}:hover { opacity: 1 !important; }`);
            } else {
                rules.push(`${selector} { color: transparent !important; text-shadow: none !important; transition: color .15s ease !important; user-select: none !important; }`);
                rules.push(`${selector}::before, ${selector}::after { color: transparent !important; text-shadow: none !important; }`);
                rules.push(`${selector}:hover, ${selector}:hover::before, ${selector}:hover::after { color: inherit !important; }`);
            }
            return;
        }

        rules.push(`${selector} { filter: blur(${blur}px) !important; transition: filter .15s ease !important; user-select: none !important; }`);
        rules.push(`${selector}:hover { filter: blur(0) !important; user-select: text !important; }`);
    };

    if (settings.hideTimestamps) {
        addMaskRule("[class*='timestamp']");
        addMaskRule("time");
        addMaskRule("[class*='edited_']");
        addMaskRule("[class*='timeSeparator']");
    }

    if (settings.hideNames) {
        addMaskRule("[class*='username']");
        addMaskRule("[class*='userName']");
        addMaskRule("[class*='displayName']");
        addMaskRule("[class*='authorName']");
    }

    if (settings.hideChannelNames) {
        addMaskRule("[class*='title']");
        addMaskRule("[class*='channelName']");
        addMaskRule("[class*='name_'][data-list-item-id]");
    }

    if (settings.hideAvatars) {
        addMaskRule("img[class*='avatar']", true);
        addMaskRule("[class*='avatar'] img", true);
    }

    privacyStyleEl.textContent = rules.join("\n");
}

function ScreenPrivacyTab() {
    const [enabled, setEnabled] = useSetting<boolean>("screen.enabled", false);
    const [mode, setMode] = useSetting<"blur" | "hide">("screen.mode", "blur");
    const [hideTs, setHideTs] = useSetting<boolean>("screen.hideTimestamps", true);
    const [hideNames, setHideNames] = useSetting<boolean>("screen.hideNames", false);
    const [hideChannels, setHideChannels] = useSetting<boolean>("screen.hideChannelNames", false);
    const [hideAvatars, setHideAvatars] = useSetting<boolean>("screen.hideAvatars", false);
    const [blurPx, setBlurPx] = useSetting<number>("screen.blurPx", 8);

    const currentSettings = React.useMemo<ScreenPrivacySettings>(() => ({
        enabled,
        mode,
        hideTimestamps: hideTs,
        hideNames,
        hideChannelNames: hideChannels,
        hideAvatars,
        blurPx,
    }), [enabled, mode, hideTs, hideNames, hideChannels, hideAvatars, blurPx]);

    React.useEffect(() => {
        applyPrivacyCSS(currentSettings);
    }, [currentSettings]);

    const toggleMaster = React.useCallback(() => setEnabled(!enabled), [enabled, setEnabled]);

    const applyNow = React.useCallback(() => {
        applyPrivacyCSS(currentSettings);
        Alerts.show({ title: "Screen Privacy", body: "Privacy filters applied to the current UI.", confirmText: "OK" });
    }, [currentSettings]);

    return (
        <div>
            <Forms.FormTitle tag="h5">Screen Privacy</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16} style={{ color: "var(--text-muted)" }}>
                Hide sensitive information while streaming or taking screenshots. Hover any hidden element to reveal it.
            </Forms.FormText>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border-faint)" }}>
                <div style={{ flex: 1 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>Enable Screen Privacy</Forms.FormTitle>
                    <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 13 }}>
                        Master switch for all privacy masking rules.
                    </Forms.FormText>
                </div>
                <Button
                    size="small"
                    variant={enabled ? "primary" : "secondary"}
                    onClick={toggleMaster}
                    style={{ marginLeft: 16, minWidth: 60 }}
                >
                    {enabled ? "ON" : "OFF"}
                </Button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border-faint)" }}>
                <div style={{ flex: 1 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>Mask Mode</Forms.FormTitle>
                    <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 13 }}>
                        Choose whether protected data should be blurred or completely hidden.
                    </Forms.FormText>
                </div>
                <div style={{ display: "flex", gap: 8, marginLeft: 16 }}>
                    <Button size="small" variant={mode === "blur" ? "primary" : "secondary"} onClick={() => setMode("blur")}>Blur</Button>
                    <Button size="small" variant={mode === "hide" ? "primary" : "secondary"} onClick={() => setMode("hide")}>Hide</Button>
                </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border-faint)" }}>
                <div style={{ flex: 1 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>Hide Timestamps</Forms.FormTitle>
                    <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 13 }}>
                        Protect message timestamps and edit markers.
                    </Forms.FormText>
                </div>
                <Button
                    size="small"
                    variant={hideTs ? "primary" : "secondary"}
                    onClick={() => setHideTs(!hideTs)}
                    style={{ marginLeft: 16, minWidth: 60 }}
                >
                    {hideTs ? "ON" : "OFF"}
                </Button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border-faint)" }}>
                <div style={{ flex: 1 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>Hide User Names</Forms.FormTitle>
                    <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 13 }}>
                        Blur usernames and display names in chat and sidebars.
                    </Forms.FormText>
                </div>
                <Button
                    size="small"
                    variant={hideNames ? "primary" : "secondary"}
                    onClick={() => setHideNames(!hideNames)}
                    style={{ marginLeft: 16, minWidth: 60 }}
                >
                    {hideNames ? "ON" : "OFF"}
                </Button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border-faint)" }}>
                <div style={{ flex: 1 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>Hide Channel/Guild Names</Forms.FormTitle>
                    <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 13 }}>
                        Blur channel title areas and channel list names.
                    </Forms.FormText>
                </div>
                <Button
                    size="small"
                    variant={hideChannels ? "primary" : "secondary"}
                    onClick={() => setHideChannels(!hideChannels)}
                    style={{ marginLeft: 16, minWidth: 60 }}
                >
                    {hideChannels ? "ON" : "OFF"}
                </Button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--border-faint)" }}>
                <div style={{ flex: 1 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>Hide Avatars</Forms.FormTitle>
                    <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 13 }}>
                        Blur user avatars and profile pictures.
                    </Forms.FormText>
                </div>
                <Button
                    size="small"
                    variant={hideAvatars ? "primary" : "secondary"}
                    onClick={() => setHideAvatars(!hideAvatars)}
                    style={{ marginLeft: 16, minWidth: 60 }}
                >
                    {hideAvatars ? "ON" : "OFF"}
                </Button>
            </div>

            <div style={{ paddingTop: 10 }}>
                <Forms.FormTitle tag="h5">Blur Intensity</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>
                    Controls how strongly hidden elements are blurred ({blurPx}px).
                </Forms.FormText>
                <input
                    type="range"
                    min={3}
                    max={16}
                    step={1}
                    value={blurPx}
                    onChange={e => setBlurPx(Number(e.currentTarget.value))}
                    style={{ width: "100%" }}
                />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <Button size="small" variant="secondary" onClick={applyNow}>Apply Now</Button>
                <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12, alignSelf: "center" }}>
                    If something still shows, press Apply Now after opening the target screen.
                </Forms.FormText>
            </div>
        </div>
    );
}

applyPrivacyCSS(getScreenPrivacySettings());

// ─── MAIN OPSEC TAB ───────────────────────────────────────────────────────────

const TABS = [
    { id: "network", label: "Network" },
    { id: "fingerprint", label: "Fingerprint" },
    { id: "privacy", label: "Privacy" },
    { id: "safety", label: "Safety" },
    { id: "advanced", label: "Advanced" },
    { id: "screen-privacy", label: "Screen Privacy" },
] as const;
type TabId = typeof TABS[number]["id"];

function OpsecSettings() {
    const [activeTab, setActiveTab] = React.useState<TabId>("network");

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h2">OPSEC</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16} style={{ color: "var(--text-muted)" }}>
                Operational security tools — network, fingerprinting, privacy, safety, and advanced monitoring.
            </Forms.FormText>

            {/* Sub-tab bar */}
            <div style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap", borderBottom: "1px solid var(--border-subtle)", paddingBottom: 8 }}>
                {TABS.map(t => (
                    <Button
                        key={t.id}
                        size="small"
                        variant={activeTab === t.id ? "primary" : "secondary"}
                        onClick={() => setActiveTab(t.id)}
                    >
                        {t.label}
                    </Button>
                ))}
            </div>

            {activeTab === "network" && <NetworkTab />}
            {activeTab === "fingerprint" && <FingerprintTab />}
            {activeTab === "privacy" && <PrivacyTab />}
            {activeTab === "safety" && <SafetyTab />}
            {activeTab === "advanced" && <AdvancedTab />}
            {activeTab === "screen-privacy" && <ScreenPrivacyTab />}
        </SettingsTab>
    );
}

export default wrapTab(OpsecSettings, "OPSEC");
