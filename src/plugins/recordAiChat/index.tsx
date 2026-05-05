/*
 * ReCord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { createRoot, Forms, React, Select, Text, TextArea, TextInput, Toasts, showToast } from "@webpack/common";

const cl = classNameFactory("vc-record-ai-chat-");
const BUBBLE_STORAGE_KEY = "record_ai_chat_bubble_position";
const FAB_SIZE = 54;
const FAB_MARGIN = 16;

type Provider = "openai" | "gemini" | "grok" | "anthropic" | "openai-compatible";
type ChatRole = "user" | "assistant";

interface ChatMessage {
    role: ChatRole;
    content: string;
    provider: Provider;
    timestamp: number;
}

interface ProviderInfo {
    label: string;
    defaultModel: string;
    defaultBaseUrl?: string;
    supportsBaseUrl: boolean;
}

const PROVIDERS: Record<Provider, ProviderInfo> = {
    openai: {
        label: "ChatGPT / OpenAI",
        defaultModel: "gpt-4o-mini",
        defaultBaseUrl: "https://api.openai.com/v1",
        supportsBaseUrl: false
    },
    gemini: {
        label: "Gemini",
        defaultModel: "gemini-2.0-flash",
        defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        supportsBaseUrl: false
    },
    grok: {
        label: "Grok / xAI",
        defaultModel: "grok-3-mini",
        defaultBaseUrl: "https://api.x.ai/v1",
        supportsBaseUrl: false
    },
    anthropic: {
        label: "Anthropic",
        defaultModel: "claude-3-5-sonnet-latest",
        defaultBaseUrl: "https://api.anthropic.com/v1",
        supportsBaseUrl: false
    },
    "openai-compatible": {
        label: "OpenAI-Compatible",
        defaultModel: "gpt-4o-mini",
        defaultBaseUrl: "https://api.openai.com/v1",
        supportsBaseUrl: true
    }
};

const PROVIDER_MODEL_PRESETS: Record<Provider, string[]> = {
    openai: ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4o", "o4-mini"],
    gemini: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
    grok: ["grok-3-mini", "grok-3", "grok-2-1212"],
    anthropic: ["claude-3-5-sonnet-latest", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
    "openai-compatible": ["gpt-4o-mini", "llama-3.3-70b-instruct", "deepseek-chat", "qwen2.5-72b-instruct"]
};

const settings = definePluginSettings({
    config: {
        type: OptionType.COMPONENT,
        component: AIChatSettings
    }
}).withPrivateSettings<{
    provider?: Provider;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    showFloatingButton?: boolean;
}>();

let buttonRoot: ReturnType<typeof createRoot> | null = null;
let buttonHost: HTMLDivElement | null = null;
let conversation: ChatMessage[] = [];
let bubblePosition: { x: number; y: number; } | null = null;

function getDefaultBubblePosition() {
    if (typeof window === "undefined") {
        return {
            x: 22,
            y: 22
        };
    }

    return {
        x: Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - 22),
        y: Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - 22)
    };
}

function clampBubblePosition(position: { x: number; y: number; }) {
    if (typeof window === "undefined") return position;

    return {
        x: Math.max(FAB_MARGIN, Math.min(position.x, window.innerWidth - FAB_SIZE - FAB_MARGIN)),
        y: Math.max(FAB_MARGIN, Math.min(position.y, window.innerHeight - FAB_SIZE - FAB_MARGIN))
    };
}

function loadBubblePosition() {
    if (typeof window === "undefined") return getDefaultBubblePosition();

    try {
        const raw = window.localStorage.getItem(BUBBLE_STORAGE_KEY);
        if (!raw) return getDefaultBubblePosition();

        const parsed = JSON.parse(raw);
        if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") {
            return getDefaultBubblePosition();
        }

        return clampBubblePosition({ x: parsed.x, y: parsed.y });
    } catch {
        return getDefaultBubblePosition();
    }
}

function persistBubblePosition(position: { x: number; y: number; }) {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(BUBBLE_STORAGE_KEY, JSON.stringify(position));
    } catch {
        // Ignore storage failures and keep runtime position only.
    }
}

function getInitialBubblePosition() {
    if (bubblePosition) return bubblePosition;
    bubblePosition = loadBubblePosition();
    return bubblePosition;
}

function getProvider(): Provider {
    return (settings.store.provider ?? "openai") as Provider;
}

function getProviderInfo(provider = getProvider()) {
    return PROVIDERS[provider];
}

function getResolvedConfig() {
    const provider = getProvider();
    const info = getProviderInfo(provider);

    return {
        provider,
        providerInfo: info,
        apiKey: settings.store.apiKey?.trim() || "",
        model: settings.store.model?.trim() || info.defaultModel,
        baseUrl: (settings.store.baseUrl?.trim() || info.defaultBaseUrl || "").replace(/\/$/, ""),
        systemPrompt: settings.store.systemPrompt?.trim() || "You are ReCord AI. Be concise, helpful, and technically accurate.",
        temperature: Number.isFinite(Number(settings.store.temperature)) ? Math.max(0, Math.min(2, Number(settings.store.temperature))) : 0.7,
        maxTokens: Number.isFinite(Number(settings.store.maxTokens)) ? Math.max(128, Math.min(8192, Number(settings.store.maxTokens))) : 1024,
        showFloatingButton: settings.store.showFloatingButton !== false
    };
}

function textFromUnknownContent(content: any): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map(part => {
                if (typeof part === "string") return part;
                if (typeof part?.text === "string") return part.text;
                if (typeof part?.content === "string") return part.content;
                return "";
            })
            .filter(Boolean)
            .join("\n");
    }

    if (typeof content?.text === "string") return content.text;
    return "";
}

function serializeOpenAiMessages(messages: ChatMessage[], systemPrompt: string) {
    return [
        { role: "system", content: systemPrompt },
        ...messages.map(message => ({
            role: message.role,
            content: message.content
        }))
    ];
}

function serializeGeminiMessages(messages: ChatMessage[]) {
    return messages.map(message => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
    }));
}

function normalizeGeminiModel(model: string) {
    return model.replace(/^models\//, "");
}

async function parseResponsePayload(response: Response) {
    const raw = await response.text();
    try {
        return raw ? JSON.parse(raw) : {};
    } catch {
        return { raw };
    }
}

function getApiErrorMessage(payload: any, fallback: string) {
    return payload?.error?.message
        || payload?.message
        || (typeof payload?.raw === "string" ? payload.raw.slice(0, 400) : "")
        || fallback;
}

async function requestReply(messages: ChatMessage[]) {
    const config = getResolvedConfig();

    if (!config.apiKey) {
        throw new Error("Add an API key in the ReCord AI Chat plugin settings first.");
    }

    switch (config.provider) {
        case "gemini": {
            const model = normalizeGeminiModel(config.model);
            const url = `${config.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: config.systemPrompt }]
                    },
                    contents: serializeGeminiMessages(messages),
                    generationConfig: {
                        temperature: config.temperature,
                        maxOutputTokens: config.maxTokens
                    }
                })
            });

            const data = await parseResponsePayload(response);
            if (!response.ok) throw new Error(getApiErrorMessage(data, `Gemini request failed (${response.status})`));

            const parts = data?.candidates?.[0]?.content?.parts ?? [];
            const text = parts.map((part: any) => part?.text || "").filter(Boolean).join("\n").trim();
            if (!text) throw new Error("Gemini returned an empty response.");
            return text;
        }

        case "anthropic": {
            const response = await fetch(`${config.baseUrl}/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": config.apiKey,
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify({
                    model: config.model,
                    system: config.systemPrompt,
                    max_tokens: config.maxTokens,
                    temperature: config.temperature,
                    messages: messages.map(message => ({
                        role: message.role,
                        content: message.content
                    }))
                })
            });

            const data = await parseResponsePayload(response);
            if (!response.ok) throw new Error(getApiErrorMessage(data, `Anthropic request failed (${response.status})`));

            const text = textFromUnknownContent(data?.content).trim();
            if (!text) throw new Error("Anthropic returned an empty response.");
            return text;
        }

        case "grok":
        case "openai-compatible":
        case "openai":
        default: {
            const response = await fetch(`${config.baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    temperature: config.temperature,
                    max_tokens: config.maxTokens,
                    messages: serializeOpenAiMessages(messages, config.systemPrompt)
                })
            });

            const data = await parseResponsePayload(response);
            if (!response.ok) throw new Error(getApiErrorMessage(data, `AI request failed (${response.status})`));

            const text = textFromUnknownContent(data?.choices?.[0]?.message?.content).trim();
            if (!text) throw new Error("The provider returned an empty response.");
            return text;
        }
    }
}

function clearConversation() {
    conversation = [];
}

function ChatBubbleIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path fill="currentColor" d="M12 3C6.477 3 2 6.91 2 11.733c0 2.558 1.256 4.86 3.26 6.47L4.4 21.6a.75.75 0 0 0 .986.986l3.555-1.383c.964.255 1.992.397 3.059.397 5.523 0 10-3.91 10-8.867C22 6.91 17.523 3 12 3Z" />
            <circle cx="8" cy="11.8" r="1.1" fill="var(--background-primary)" />
            <circle cx="12" cy="11.8" r="1.1" fill="var(--background-primary)" />
            <circle cx="16" cy="11.8" r="1.1" fill="var(--background-primary)" />
        </svg>
    );
}

function openAIChatModal() {
    openModal(modalProps => (
        <ErrorBoundary>
            <AIChatModal modalProps={modalProps} />
        </ErrorBoundary>
    ));
}

function FloatingButton() {
    const { showFloatingButton } = settings.use();
    const [position, setPosition] = React.useState(getInitialBubblePosition);
    const dragRef = React.useRef<{
        pointerId: number;
        offsetX: number;
        offsetY: number;
        moved: boolean;
    } | null>(null);
    const suppressClickRef = React.useRef(false);

    const setBubble = React.useCallback((next: { x: number; y: number; }, persist = true) => {
        const clamped = clampBubblePosition(next);
        bubblePosition = clamped;
        setPosition(clamped);
        if (persist) persistBubblePosition(clamped);
    }, []);

    React.useEffect(() => {
        const onResize = () => {
            const current = bubblePosition ?? getDefaultBubblePosition();
            setBubble(current);
        };

        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [setBubble]);

    if (showFloatingButton === false) return null;

    return (
        <button
            className={cl("fab")}
            style={{ left: `${position.x}px`, top: `${position.y}px` }}
            onPointerDown={event => {
                const target = event.currentTarget;
                const rect = target.getBoundingClientRect();
                dragRef.current = {
                    pointerId: event.pointerId,
                    offsetX: event.clientX - rect.left,
                    offsetY: event.clientY - rect.top,
                    moved: false
                };
                target.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;

                const nextPosition = {
                    x: event.clientX - drag.offsetX,
                    y: event.clientY - drag.offsetY
                };

                const previous = bubblePosition ?? position;
                if (!drag.moved && (Math.abs(nextPosition.x - previous.x) > 3 || Math.abs(nextPosition.y - previous.y) > 3)) {
                    drag.moved = true;
                    suppressClickRef.current = true;
                }

                setBubble(nextPosition, false);
            }}
            onPointerUp={event => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;

                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }

                dragRef.current = null;
                const current = bubblePosition ?? position;
                setBubble(current, true);
            }}
            onClick={() => {
                if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                }

                openAIChatModal();
            }}
            title="Open ReCord AI Chat (drag to move)"
            type="button"
        >
            <ChatBubbleIcon />
        </button>
    );
}

function AIChatModal({ modalProps }: { modalProps: ModalProps; }) {
    const config = getResolvedConfig();
    const [messages, setMessages] = React.useState(() => conversation);
    const [draft, setDraft] = React.useState("");
    const [pending, setPending] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const scrollerRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        scroller.scrollTop = scroller.scrollHeight;
    }, [messages, pending]);

    async function sendMessage() {
        const nextPrompt = draft.trim();
        if (!nextPrompt || pending) return;

        const userMessage: ChatMessage = {
            role: "user",
            content: nextPrompt,
            provider: config.provider,
            timestamp: Date.now()
        };

        const nextConversation = [...conversation, userMessage];
        conversation = nextConversation;
        setMessages(nextConversation);
        setDraft("");
        setPending(true);
        setError(null);

        try {
            const reply = await requestReply(nextConversation);
            const assistantMessage: ChatMessage = {
                role: "assistant",
                content: reply,
                provider: config.provider,
                timestamp: Date.now()
            };

            conversation = [...nextConversation, assistantMessage];
            setMessages(conversation);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to talk to the AI provider.";
            setError(message);
            showToast(message, Toasts.Type.FAILURE);
        } finally {
            setPending(false);
        }
    }

    return (
        <ModalRoot {...modalProps} size={ModalSize.DYNAMIC}>
            <ModalHeader className={cl("modal-header")}>
                <div className={cl("modal-heading")}>
                    <Text variant="heading-lg/semibold">ReCord AI Chat</Text>
                    <Text variant="text-sm/normal">{config.providerInfo.label} · {config.model}</Text>
                </div>
                <div className={cl("modal-actions")}>
                    <Button size="small" variant="secondary" onClick={() => {
                        clearConversation();
                        setMessages([]);
                        setError(null);
                    }}>
                        Clear
                    </Button>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent className={cl("modal-body")}>
                {!config.apiKey && (
                    <div className={cl("status-card")}>
                        <Text variant="text-sm/normal">
                            No API key set. Go to <strong>Settings → Plugins → ReCord AI Chat → gear icon</strong> to set your provider and API key. Supported: OpenAI, Gemini, Anthropic, and OpenAI-compatible APIs.
                        </Text>
                    </div>
                )}

                <div className={cl("conversation")} ref={scrollerRef}>
                    {!messages.length && (
                        <div className={cl("empty")}>
                            <Heading tag="h3">Start a conversation</Heading>
                            <Text variant="text-sm/normal">Ask for code help, refactors, explanations, or quick ideas without leaving Discord.</Text>
                        </div>
                    )}

                    {messages.map((message, index) => (
                        <div key={`${message.timestamp}-${index}`} className={cl("message", {
                            "message-user": message.role === "user",
                            "message-assistant": message.role === "assistant"
                        })}>
                            <div className={cl("message-meta")}>{message.role === "user" ? "You" : "AI"}</div>
                            <div className={cl("message-body")}>{message.content}</div>
                        </div>
                    ))}

                    {pending && (
                        <div className={cl("message", { "message-assistant": true })}>
                            <div className={cl("message-meta")}>AI</div>
                            <div className={cl("message-body")}>Thinking…</div>
                        </div>
                    )}
                </div>

                {error && <Text className={cl("error")} variant="text-sm/normal">{error}</Text>}

                <div className={cl("composer")}>
                    <TextArea
                        value={draft}
                        onChange={setDraft}
                        autoFocus
                        placeholder="Type your message here… (Shift+Enter for new line)"
                        onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void sendMessage();
                            }
                        }}
                    />
                    <div className={cl("composer-actions")}>
                        <Button size="small" variant="secondary" onClick={modalProps.onClose}>Close</Button>
                        <Button size="small" onClick={() => void sendMessage()} disabled={!draft.trim() || pending}>Send</Button>
                    </div>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

function Field(props: {
    label: string;
    note?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cl("settings-field")}>
            <Heading tag="h4">{props.label}</Heading>
            {props.note && <Text variant="text-sm/normal">{props.note}</Text>}
            {props.children}
        </div>
    );
}

function AIChatSettings() {
    const s = settings.use();
    const [provider, setProvider] = React.useState<Provider>(() => (s.provider ?? "openai") as Provider);
    const [apiKey, setApiKey] = React.useState(s.apiKey ?? "");
    const [model, setModel] = React.useState(s.model ?? "");
    const [baseUrl, setBaseUrl] = React.useState(s.baseUrl ?? "");
    const [systemPrompt, setSystemPrompt] = React.useState(s.systemPrompt ?? "");
    const [temperature, setTemperature] = React.useState(s.temperature != null ? String(s.temperature) : "");
    const [maxTokens, setMaxTokens] = React.useState(s.maxTokens != null ? String(s.maxTokens) : "");
    const [showFloatingButton, setShowFloatingButton] = React.useState(s.showFloatingButton !== false);
    const [dirty, setDirty] = React.useState(false);

    const providerInfo = getProviderInfo(provider);
    const modelPresets = PROVIDER_MODEL_PRESETS[provider];

    const applyProvider = React.useCallback((nextProvider: Provider) => {
        const nextInfo = getProviderInfo(nextProvider);
        setProvider(nextProvider);
        if (!model.trim()) setModel(nextInfo.defaultModel);
        if (!nextInfo.supportsBaseUrl) setBaseUrl(nextInfo.defaultBaseUrl || "");
        setDirty(true);
    }, [model]);

    const resetDraft = React.useCallback(() => {
        setProvider((settings.store.provider ?? "openai") as Provider);
        setApiKey(settings.store.apiKey ?? "");
        setModel(settings.store.model ?? "");
        setBaseUrl(settings.store.baseUrl ?? "");
        setSystemPrompt(settings.store.systemPrompt ?? "");
        setTemperature(settings.store.temperature != null ? String(settings.store.temperature) : "");
        setMaxTokens(settings.store.maxTokens != null ? String(settings.store.maxTokens) : "");
        setShowFloatingButton(settings.store.showFloatingButton !== false);
        setDirty(false);
    }, []);

    const saveDraft = React.useCallback(() => {
        const parsedTemperature = temperature.trim() ? Number(temperature) : undefined;
        const parsedMaxTokens = maxTokens.trim() ? Number(maxTokens) : undefined;

        if (parsedTemperature != null && (!Number.isFinite(parsedTemperature) || parsedTemperature < 0 || parsedTemperature > 2)) {
            showToast("Temperature must be a number between 0 and 2.", Toasts.Type.FAILURE);
            return;
        }

        if (parsedMaxTokens != null && (!Number.isFinite(parsedMaxTokens) || parsedMaxTokens < 128 || parsedMaxTokens > 8192)) {
            showToast("Max tokens must be a number between 128 and 8192.", Toasts.Type.FAILURE);
            return;
        }

        settings.store.provider = provider;
        settings.store.apiKey = apiKey.trim();
        settings.store.model = model.trim();
        settings.store.baseUrl = baseUrl.trim();
        settings.store.systemPrompt = systemPrompt;
        settings.store.temperature = parsedTemperature;
        settings.store.maxTokens = parsedMaxTokens;
        settings.store.showFloatingButton = showFloatingButton;
        mountFloatingButton();

        setDirty(false);
        showToast("ReCord AI settings saved.", Toasts.Type.SUCCESS);
    }, [apiKey, baseUrl, maxTokens, model, provider, showFloatingButton, systemPrompt, temperature]);

    return (
        <div className={cl("settings-root")}>
            <div className={cl("settings-hero")}>
                <div>
                    <Heading tag="h3">ReCord AI Chat</Heading>
                    <Text variant="text-sm/normal">A floating chat bubble that opens a popup assistant anywhere in the client.</Text>
                </div>
                <span className={cl("settings-chip")}>{providerInfo.label}</span>
            </div>

            <Field label="Provider" note="Choose which API powers the popup chat.">
                <div className={cl("provider-picker")}>
                    {(["openai", "gemini", "grok", "anthropic", "openai-compatible"] as Provider[]).map(value => (
                        <Button
                            key={value}
                            size="small"
                            variant={provider === value ? "primary" : "secondary"}
                            onClick={() => applyProvider(value)}
                        >
                            {PROVIDERS[value].label}
                        </Button>
                    ))}
                </div>
                <Select
                    options={Object.entries(PROVIDERS).map(([value, info], index) => ({
                        label: info.label,
                        value,
                        default: index === 0
                    }))}
                    serialize={String}
                    select={value => applyProvider(value as Provider)}
                    isSelected={value => value === provider}
                    closeOnSelect={true}
                />
            </Field>

            <Field label="API Key" note="Stored in private plugin settings. Paste the key, then click Save Settings.">
                <TextInput
                    type="password"
                    placeholder="Paste your provider API key"
                    value={apiKey}
                    onChange={value => {
                        setApiKey(value);
                        setDirty(true);
                    }}
                />
            </Field>

            <div className={cl("settings-grid")}>
                <Field label="Model" note={`Default: ${providerInfo.defaultModel}`}>
                    <Select
                        options={modelPresets.map((value, index) => ({
                            label: value,
                            value,
                            default: index === 0
                        }))}
                        serialize={String}
                        select={value => {
                            setModel(String(value));
                            setDirty(true);
                        }}
                        isSelected={value => value === model}
                        closeOnSelect={true}
                    />
                    <TextInput
                        type="text"
                        placeholder={providerInfo.defaultModel}
                        value={model}
                        onChange={value => {
                            setModel(value);
                            setDirty(true);
                        }}
                    />
                </Field>

                <Field label="Floating Button" note="Keep the chat bubble visible on screen.">
                    <Select
                        options={[
                            { label: "Enabled", value: true, default: true },
                            { label: "Hidden", value: false }
                        ]}
                        serialize={String}
                        select={value => {
                            setShowFloatingButton(!!value);
                            setDirty(true);
                        }}
                        isSelected={value => value === showFloatingButton}
                        closeOnSelect={true}
                    />
                </Field>
            </div>

            {providerInfo.supportsBaseUrl && (
                <Field label="Base URL" note="For OpenAI-compatible providers such as OpenRouter, Together, Groq, LM Studio, or Ollama gateways.">
                    <TextInput
                        type="text"
                        placeholder={providerInfo.defaultBaseUrl}
                        value={baseUrl}
                        onChange={value => {
                            setBaseUrl(value);
                            setDirty(true);
                        }}
                    />
                </Field>
            )}

            <div className={cl("settings-grid")}>
                <Field label="Temperature" note="0.0 to 2.0">
                    <TextInput
                        type="text"
                        placeholder="0.7"
                        value={temperature}
                        onChange={value => {
                            setTemperature(value);
                            setDirty(true);
                        }}
                    />
                </Field>

                <Field label="Max Tokens" note="Response cap per reply.">
                    <TextInput
                        type="text"
                        placeholder="1024"
                        value={maxTokens}
                        onChange={value => {
                            setMaxTokens(value);
                            setDirty(true);
                        }}
                    />
                </Field>
            </div>

            <Field label="System Prompt" note="Optional instruction applied before every conversation.">
                <TextArea
                    value={systemPrompt}
                    onChange={value => {
                        setSystemPrompt(value);
                        setDirty(true);
                    }}
                    placeholder="You are ReCord AI. Be concise, helpful, and technically accurate."
                />
            </Field>

            <div className={cl("settings-actions")}>
                <Button size="small" variant="secondary" onClick={resetDraft} disabled={!dirty}>Reset</Button>
                <Button size="small" variant="primary" onClick={saveDraft} disabled={!dirty}>Save Settings</Button>
            </div>

            {dirty && (
                <Forms.FormText>
                    You have unsaved changes. Click Save Settings before using the chat bubble.
                </Forms.FormText>
            )}

            <Forms.FormText>
                Tip: if you pick OpenAI-Compatible, use your provider's base API URL and model name. The floating chat bubble works anywhere in the client and reuses the same conversation until you clear it.
            </Forms.FormText>
        </div>
    );
}

function mountFloatingButton() {
    if (typeof document === "undefined") return;

    const { showFloatingButton } = getResolvedConfig();
    if (!showFloatingButton) {
        buttonRoot?.unmount();
        buttonRoot = null;
        buttonHost?.remove();
        buttonHost = null;
        return;
    }

    if (!buttonHost) {
        buttonHost = document.createElement("div");
        buttonHost.className = cl("host");
        document.body.appendChild(buttonHost);
    }

    if (!buttonRoot) {
        buttonRoot = createRoot(buttonHost);
    }

    buttonRoot.render(
        <ErrorBoundary>
            <FloatingButton />
        </ErrorBoundary>
    );
}

export default definePlugin({
    name: "ReCordAIChat",
    description: "Adds a floating AI chat bubble with popup chat support for OpenAI, Gemini, Anthropic, and OpenAI-compatible APIs.",
    authors: [Devs.Rloxx],
    tags: ["ai", "chatgpt", "gemini", "anthropic", "assistant"],
    settings,

    start() {
        mountFloatingButton();
    },

    stop() {
        buttonRoot?.unmount();
        buttonRoot = null;
        buttonHost?.remove();
        buttonHost = null;
    },
});
