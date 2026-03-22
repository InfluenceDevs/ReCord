#!/usr/bin/env sh
# ReCord Shell Installer
# Usage: curl -fsSL https://github.com/InfluenceDevs/ReCord/releases/latest/download/install.sh | sh

set -e

REPO="InfluenceDevs/ReCord"
API_URL="https://api.github.com/repos/$REPO/releases/latest"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo ""
echo "  ReCord Installer"
echo "  ================="
echo ""

# Detect platform
OS="$(uname -s)"
case "$OS" in
    Darwin) PLATFORM="macOS" ; ARCHIVE="ReCord-macOS-Installer.zip" ;;
    Linux)  PLATFORM="Linux" ; ARCHIVE="ReCord-Linux-Installer.zip" ;;
    *)
        echo "Unsupported platform: $OS" >&2
        echo "Please download the installer manually from:"
        echo "  https://github.com/$REPO/releases/latest"
        exit 1 ;;
esac

echo "Detected platform: $PLATFORM"
echo "Fetching latest release..."

# Fetch release info
if command -v curl >/dev/null 2>&1; then
    RELEASE_JSON="$(curl -fsSL -H "User-Agent: ReCord-Installer" "$API_URL")"
elif command -v wget >/dev/null 2>&1; then
    RELEASE_JSON="$(wget -qO- --header="User-Agent: ReCord-Installer" "$API_URL")"
else
    echo "ERROR: curl or wget is required." >&2
    exit 1
fi

TAG="$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
DOWNLOAD_URL="$(echo "$RELEASE_JSON" | grep '"browser_download_url"' | grep "$ARCHIVE" | head -1 | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/')"

if [ -z "$DOWNLOAD_URL" ]; then
    echo "ERROR: Could not find $ARCHIVE in release $TAG" >&2
    echo "Please download manually from: https://github.com/$REPO/releases/latest" >&2
    exit 1
fi

echo "Latest release: $TAG"
echo "Downloading $ARCHIVE..."

if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$TMP_DIR/$ARCHIVE" "$DOWNLOAD_URL"
else
    wget -qO "$TMP_DIR/$ARCHIVE" "$DOWNLOAD_URL"
fi

echo "Extracting..."
unzip -q "$TMP_DIR/$ARCHIVE" -d "$TMP_DIR/extracted"

# Find and run the installer binary
if [ "$OS" = "Darwin" ]; then
    INSTALLER="$(find "$TMP_DIR/extracted" -name "ReCordInstaller*" ! -name "*.zip" -type f | head -1)"
else
    INSTALLER="$(find "$TMP_DIR/extracted" -name "ReCordInstallerCli*" -type f | head -1)"
fi

if [ -z "$INSTALLER" ]; then
    echo "ERROR: Could not locate installer binary in the extracted archive." >&2
    ls -la "$TMP_DIR/extracted"
    exit 1
fi

chmod +x "$INSTALLER"
echo ""
echo "Launching ReCord installer..."
echo ""
"$INSTALLER"
