/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./styles.css";

import { useSettings } from "@api/Settings";
import { Card } from "@components/Card";
import { Link } from "@components/Link";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { useCspErrors } from "@utils/cspViolations";
import { getStylusWebStoreUrl } from "@utils/web";
import { Forms, React, TabBar, useState } from "@webpack/common";

import { CspErrorCard } from "./CspErrorCard";
import { LocalThemesTab } from "./LocalThemesTab";
import { OnlineThemesTab } from "./OnlineThemesTab";

const enum ThemeTab {
    LOCAL,
    ONLINE
}

const RECORD_DEFAULT_THEME_URL = "https://raw.githubusercontent.com/InfluenceDevs/ReCord-Theme/main/ReCordTheme.css";

function ThemeDiagnosticsCard() {
    const settings = useSettings(["themeLinks", "enabledThemes"]);
    const blockedUrls = useCspErrors();

    return (
        <Card variant={blockedUrls.length > 0 ? "warning" : "normal"} defaultPadding>
            <Forms.FormTitle tag="h5">Theme Diagnostics</Forms.FormTitle>
            <Forms.FormText>
                Active sources: {1 + settings.themeLinks.length + settings.enabledThemes.length}
            </Forms.FormText>
            <Forms.FormText>
                Built-in base theme: <Link href={RECORD_DEFAULT_THEME_URL}>{RECORD_DEFAULT_THEME_URL}</Link>
            </Forms.FormText>
            <Forms.FormText>
                CSP-blocked resources: {blockedUrls.length}
            </Forms.FormText>
            {!!blockedUrls.length && (
                <>
                    <Forms.FormText>Blocked URLs (latest first):</Forms.FormText>
                    {blockedUrls.slice().reverse().slice(0, 8).map(url => (
                        <Forms.FormText key={url}>
                            {url.startsWith("http") ? <Link href={url}>{url}</Link> : url}
                        </Forms.FormText>
                    ))}
                </>
            )}
        </Card>
    );
}

function ThemesTab() {
    const [currentTab, setCurrentTab] = useState(ThemeTab.LOCAL);

    return (
        <SettingsTab>
            <TabBar
                type="top"
                look="brand"
                className="vc-settings-tab-bar"
                selectedItem={currentTab}
                onItemSelect={setCurrentTab}
            >
                <TabBar.Item
                    className="vc-settings-tab-bar-item"
                    id={ThemeTab.LOCAL}
                >
                    Local Themes
                </TabBar.Item>
                <TabBar.Item
                    className="vc-settings-tab-bar-item"
                    id={ThemeTab.ONLINE}
                >
                    Online Themes
                </TabBar.Item>
            </TabBar>

            <CspErrorCard />
            <ThemeDiagnosticsCard />

            {currentTab === ThemeTab.LOCAL && <LocalThemesTab />}
            {currentTab === ThemeTab.ONLINE && <OnlineThemesTab />}
        </SettingsTab>
    );
}

function UserscriptThemesTab() {
    return (
        <SettingsTab>
            <Card variant="danger">
                <Forms.FormTitle tag="h5">Themes are not supported on the Userscript!</Forms.FormTitle>

                <Forms.FormText>
                    You can instead install themes with the <Link href={getStylusWebStoreUrl()}>Stylus extension</Link>!
                </Forms.FormText>
            </Card>
        </SettingsTab>
    );
}

export default IS_USERSCRIPT
    ? wrapTab(UserscriptThemesTab, "Themes")
    : wrapTab(ThemesTab, "Themes");
