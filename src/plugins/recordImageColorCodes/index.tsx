/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Button } from "@components/Button";
import { copyToClipboard } from "@utils/clipboard";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Forms, Menu, React } from "@webpack/common";

const Influence = { name: "Influence", id: 0n };

type ColorAnalysis = {
    hex: string;
    rgb: string;
    sampleCount: number;
};

type MediaAnalysis = {
    kind: "image" | "video" | "audio" | "file";
    contentType: string;
    sizeBytes: number;
    sizeLabel: string;
    width?: number;
    height?: number;
    duration?: number;
    fileName: string;
    source: string;
};

const COLOR_CODE_CLASS = "record-color-code-preview";
const COLOR_CODE_STYLE_ID = "record-color-code-preview-style";
const COLOR_CODE_REGEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)/g;

let observer: MutationObserver | null = null;
let styleElement: HTMLStyleElement | null = null;

function rgbToHex(red: number, green: number, blue: number) {
    return `#${[red, green, blue].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function formatBytes(sizeBytes: number) {
    if (!Number.isFinite(sizeBytes) || sizeBytes < 1024) return `${sizeBytes} B`;

    const units = ["KB", "MB", "GB"];
    let value = sizeBytes / 1024;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDuration(duration?: number) {
    if (!duration || !Number.isFinite(duration)) return undefined;

    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = Math.floor(duration % 60);
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getFileNameFromUrl(src: string) {
    try {
        const url = new URL(src);
        const fileName = url.pathname.split("/").pop();
        return fileName || "media";
    } catch {
        return "media";
    }
}

function clampByte(value: number) {
    return Math.max(0, Math.min(255, value));
}

function normalizeColorToken(token: string) {
    const trimmed = token.trim();

    if (trimmed.startsWith("#")) {
        const hex = trimmed.slice(1);
        if (![3, 4, 6, 8].includes(hex.length)) return null;
        if (!/^[0-9a-f]+$/i.test(hex)) return null;
        return `#${hex.toUpperCase()}`;
    }

    const rgbMatch = /^rgba?\((.+)\)$/i.exec(trimmed);
    if (!rgbMatch) return null;

    const parts = rgbMatch[1].split(",").map(part => part.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;

    const rgb = parts.slice(0, 3).map(part => Number(part));
    if (rgb.some(value => !Number.isFinite(value) || value < 0 || value > 255)) return null;

    if (parts.length === 4) {
        const alpha = Number(parts[3]);
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
        return `rgba(${rgb.map(clampByte).join(", ")}, ${alpha})`;
    }

    return `rgb(${rgb.map(clampByte).join(", ")})`;
}

function ensureHoverStyle() {
    if (styleElement?.isConnected) return;

    styleElement = document.createElement("style");
    styleElement.id = COLOR_CODE_STYLE_ID;
    styleElement.textContent = `
.${COLOR_CODE_CLASS}{position:relative;display:inline-block;padding:0 2px;border-radius:4px;border-bottom:2px solid var(--record-color-preview);box-shadow:inset 0 -0.45em 0 rgba(255,255,255,0.03);cursor:default}
.${COLOR_CODE_CLASS}:hover{background:color-mix(in srgb, var(--record-color-preview) 18%, transparent)}
.${COLOR_CODE_CLASS}:hover::before{content:attr(data-color-label);position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);background:var(--background-floating);color:var(--text-normal);border:1px solid var(--border-subtle);border-radius:8px;padding:6px 10px;font-size:12px;white-space:nowrap;z-index:1000;pointer-events:none;box-shadow:var(--shadow-high)}
.${COLOR_CODE_CLASS}:hover::after{content:"";position:absolute;left:50%;top:calc(100% + 8px);transform:translateX(-50%);width:22px;height:22px;border-radius:999px;background:var(--record-color-preview);border:2px solid var(--background-floating);box-shadow:var(--shadow-high);pointer-events:none;z-index:1000}
`;
    document.head.appendChild(styleElement);
}

function unwrapPreviewSpans(root: ParentNode) {
    root.querySelectorAll?.(`.${COLOR_CODE_CLASS}`).forEach(node => {
        const parent = node.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(node.textContent || ""), node);
        parent.normalize();
    });
}

function createColorPreviewSpan(token: string, color: string) {
    const span = document.createElement("span");
    span.className = COLOR_CODE_CLASS;
    span.textContent = token;
    span.title = color;
    span.dataset.colorLabel = color;
    span.style.setProperty("--record-color-preview", color);
    return span;
}

function replaceColorCodesInTextNode(node: Text) {
    const { parentElement } = node;
    const { nodeValue: text } = node;

    COLOR_CODE_REGEX.lastIndex = 0;
    if (!parentElement || !text || !COLOR_CODE_REGEX.test(text)) return;
    if (parentElement.closest(`.${COLOR_CODE_CLASS}, code, pre, a, textarea, input, button`)) return;

    COLOR_CODE_REGEX.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let replaced = false;

    for (const match of text.matchAll(COLOR_CODE_REGEX)) {
        const token = match[0];
        const index = match.index ?? 0;
        const color = normalizeColorToken(token);
        if (!color) continue;

        if (index > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
        }

        fragment.appendChild(createColorPreviewSpan(token, color));
        lastIndex = index + token.length;
        replaced = true;
    }

    if (!replaced) return;

    if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
}

function processColorCodes(root: Node) {
    ensureHoverStyle();

    if (root.nodeType === Node.TEXT_NODE) {
        replaceColorCodesInTextNode(root as Text);
        return;
    }

    if (!(root instanceof Element)) return;
    if (root.closest(`.${COLOR_CODE_CLASS}`)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let current: Node | null;

    while ((current = walker.nextNode())) {
        textNodes.push(current as Text);
    }

    for (const textNode of textNodes) {
        replaceColorCodesInTextNode(textNode);
    }
}

function startColorObserver() {
    if (observer) return;
    if (!document.body) return;

    processColorCodes(document.body);

    observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                processColorCodes(node);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function stopColorObserver() {
    observer?.disconnect();
    observer = null;

    if (styleElement?.isConnected) {
        styleElement.remove();
    }
    styleElement = null;

    if (document.body) {
        unwrapPreviewSpans(document.body);
    }
}

async function analyzeMedia(src: string): Promise<MediaAnalysis> {
    const response = await fetch(src, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Failed to fetch media: ${response.status}`);

    const blob = await response.blob();
    const contentType = blob.type || response.headers.get("content-type") || "application/octet-stream";
    const fileName = getFileNameFromUrl(src);
    const objectUrl = URL.createObjectURL(blob);

    try {
        if (contentType.startsWith("image/")) {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error("Failed to decode image."));
                img.src = objectUrl;
            });

            return {
                kind: "image",
                contentType,
                sizeBytes: blob.size,
                sizeLabel: formatBytes(blob.size),
                width: image.naturalWidth || image.width,
                height: image.naturalHeight || image.height,
                fileName,
                source: src,
            };
        }

        if (contentType.startsWith("video/") || contentType.startsWith("audio/")) {
            const media = await new Promise<HTMLVideoElement | HTMLAudioElement>((resolve, reject) => {
                const element = document.createElement(contentType.startsWith("video/") ? "video" : "audio");
                element.preload = "metadata";
                element.onloadedmetadata = () => resolve(element);
                element.onerror = () => reject(new Error("Failed to load media metadata."));
                element.src = objectUrl;
            });

            return {
                kind: contentType.startsWith("video/") ? "video" : "audio",
                contentType,
                sizeBytes: blob.size,
                sizeLabel: formatBytes(blob.size),
                width: "videoWidth" in media ? media.videoWidth : undefined,
                height: "videoHeight" in media ? media.videoHeight : undefined,
                duration: Number.isFinite(media.duration) ? media.duration : undefined,
                fileName,
                source: src,
            };
        }

        return {
            kind: "file",
            contentType,
            sizeBytes: blob.size,
            sizeLabel: formatBytes(blob.size),
            fileName,
            source: src,
        };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

async function analyzeImage(src: string): Promise<ColorAnalysis> {
    const response = await fetch(src, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Failed to decode image."));
            img.src = objectUrl;
        });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable.");

        const width = Math.max(1, Math.min(64, image.naturalWidth || image.width || 1));
        const height = Math.max(1, Math.min(64, image.naturalHeight || image.height || 1));
        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);

        const { data } = context.getImageData(0, 0, width, height);
        let totalRed = 0;
        let totalGreen = 0;
        let totalBlue = 0;
        let sampleCount = 0;

        for (let index = 0; index < data.length; index += 4) {
            const alpha = data[index + 3];
            if (alpha < 16) continue;

            totalRed += data[index];
            totalGreen += data[index + 1];
            totalBlue += data[index + 2];
            sampleCount++;
        }

        if (!sampleCount) throw new Error("No visible pixels found.");

        const red = Math.round(totalRed / sampleCount);
        const green = Math.round(totalGreen / sampleCount);
        const blue = Math.round(totalBlue / sampleCount);

        return {
            hex: rgbToHex(red, green, blue),
            rgb: `rgb(${red}, ${green}, ${blue})`,
            sampleCount,
        };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function ColorInspectorModal({ src, onClose, transitionState }: { src: string; onClose(): void; transitionState: any; }) {
    const [state, setState] = React.useState<{ loading: boolean; analysis?: ColorAnalysis; error?: string; }>({ loading: true });

    React.useEffect(() => {
        let cancelled = false;

        analyzeImage(src)
            .then(analysis => {
                if (!cancelled) setState({ loading: false, analysis });
            })
            .catch(error => {
                if (!cancelled) setState({ loading: false, error: error instanceof Error ? error.message : "Unknown error" });
            });

        return () => {
            cancelled = true;
        };
    }, [src]);

    const { analysis } = state;

    return (
        <ModalRoot transitionState={transitionState} size={ModalSize.SMALL}>
            <ModalHeader>
                <Forms.FormTitle tag="h4">Image Color Codes</Forms.FormTitle>
                <ModalCloseButton onClick={onClose} />
            </ModalHeader>
            <ModalContent>
                {state.loading && <Forms.FormText>Analyzing image...</Forms.FormText>}
                {!state.loading && state.error && (
                    <Forms.FormText style={{ color: "var(--text-danger)" }}>
                        {state.error}
                    </Forms.FormText>
                )}
                {!state.loading && analysis && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div
                            style={{
                                width: "100%",
                                height: 72,
                                borderRadius: 12,
                                border: "1px solid var(--border-subtle)",
                                background: analysis.hex,
                            }}
                        />
                        <Forms.FormText>HEX: {analysis.hex}</Forms.FormText>
                        <Forms.FormText>RGB: {analysis.rgb}</Forms.FormText>
                        <Forms.FormText style={{ color: "var(--text-muted)" }}>
                            Based on {analysis.sampleCount} sampled visible pixels.
                        </Forms.FormText>
                    </div>
                )}
            </ModalContent>
            <ModalFooter>
                <Button
                    disabled={!analysis}
                    onClick={() => analysis && copyToClipboard(analysis.hex)}
                >
                    Copy HEX
                </Button>
                <Button
                    disabled={!analysis}
                    variant="secondary"
                    style={{ marginLeft: 8 }}
                    onClick={() => analysis && copyToClipboard(analysis.rgb)}
                >
                    Copy RGB
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function MediaMetadataModal({ src, onClose, transitionState }: { src: string; onClose(): void; transitionState: any; }) {
    const [state, setState] = React.useState<{ loading: boolean; analysis?: MediaAnalysis; error?: string; }>({ loading: true });

    React.useEffect(() => {
        let cancelled = false;

        analyzeMedia(src)
            .then(analysis => {
                if (!cancelled) setState({ loading: false, analysis });
            })
            .catch(error => {
                if (!cancelled) setState({ loading: false, error: error instanceof Error ? error.message : "Unknown error" });
            });

        return () => {
            cancelled = true;
        };
    }, [src]);

    const { analysis } = state;
    const duration = formatDuration(analysis?.duration);

    return (
        <ModalRoot transitionState={transitionState} size={ModalSize.SMALL}>
            <ModalHeader>
                <Forms.FormTitle tag="h4">Media Metadata</Forms.FormTitle>
                <ModalCloseButton onClick={onClose} />
            </ModalHeader>
            <ModalContent>
                {state.loading && <Forms.FormText>Reading media metadata...</Forms.FormText>}
                {!state.loading && state.error && (
                    <Forms.FormText style={{ color: "var(--text-danger)" }}>
                        {state.error}
                    </Forms.FormText>
                )}
                {!state.loading && analysis && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <Forms.FormText>Type: {analysis.kind}</Forms.FormText>
                        <Forms.FormText>MIME: {analysis.contentType}</Forms.FormText>
                        <Forms.FormText>File: {analysis.fileName}</Forms.FormText>
                        <Forms.FormText>Size: {analysis.sizeLabel} ({analysis.sizeBytes} bytes)</Forms.FormText>
                        {analysis.width != null && analysis.height != null && (
                            <Forms.FormText>Dimensions: {analysis.width} x {analysis.height}</Forms.FormText>
                        )}
                        {duration && <Forms.FormText>Duration: {duration}</Forms.FormText>}
                        <Forms.FormText style={{ color: "var(--text-muted)", wordBreak: "break-all" }}>
                            Source: {analysis.source}
                        </Forms.FormText>
                    </div>
                )}
            </ModalContent>
            <ModalFooter>
                <Button
                    disabled={!analysis}
                    onClick={() => analysis && copyToClipboard(JSON.stringify(analysis, null, 2))}
                >
                    Copy Metadata JSON
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function openColorInspector(src: string) {
    openModal(props => <ColorInspectorModal {...props} src={src} />);
}

function openMediaMetadata(src: string) {
    openModal(props => <MediaMetadataModal {...props} src={src} />);
}

function makeMenuItems(src: string, mediaRole?: string) {
    const items = [
        <Menu.MenuItem
            id="record-media-metadata"
            key="record-media-metadata"
            label="Show Media Metadata"
            action={() => openMediaMetadata(src)}
        />
    ];

    if (mediaRole === "img" || !mediaRole) {
        items.unshift(
            <Menu.MenuItem
                id="record-image-color-codes"
                key="record-image-color-codes"
                label="Show HEX / RGB"
                action={() => openColorInspector(src)}
            />
        );
    }

    return items;
}

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    const src = props.itemHref ?? props.itemSrc;
    if (!src) return;

    const mediaRole = props?.recordImageColorType;
    if (mediaRole !== "img" && mediaRole !== "video") return;

    const group = findGroupChildrenByChildId("copy-link", children) ?? children;
    group.push(...makeMenuItems(src, mediaRole));
};

const imageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props?.src) return;

    const group = findGroupChildrenByChildId("copy-native-link", children) ?? children;
    group.push(...makeMenuItems(props.src, "img"));
};

export default definePlugin({
    name: "RecordImageColorCodes",
    description: "Shows HEX and RGB codes for images posted in chat.",
    authors: [Influence],
    tags: ["image", "color", "hex", "rgb"],

    patches: [
        {
            find: "#{intl::MESSAGE_ACTIONS_MENU_LABEL}),shouldHideMediaOptions:",
            replacement: {
                match: /favoriteableType:\i,(?<=(\i)\.getAttribute\("data-type"\).+?)/,
                replace: (match, target) => `${match}recordImageColorType:${target}.getAttribute("data-role"),`
            }
        }
    ],

    contextMenus: {
        message: messageContextMenuPatch,
        "image-context": imageContextMenuPatch,
    },

    start() {
        startColorObserver();
    },

    stop() {
        stopColorObserver();
    },
});
