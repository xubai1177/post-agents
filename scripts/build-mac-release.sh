#!/bin/bash
set -euo pipefail
: "${LINGGAO_MAC_P12_BASE64:?Missing fixed signing certificate}"
: "${LINGGAO_MAC_P12_PASSWORD:?Missing signing certificate password}"
: "${LINGGAO_MAC_CERT_SHA1:?Missing signing certificate fingerprint}"
[[ "$LINGGAO_MAC_CERT_SHA1" =~ ^[0-9A-Fa-f]{40}$ ]] || { echo 'Invalid signing certificate fingerprint.' >&2; exit 1; }
TEST_DIR=$(mktemp -d)
KEYCHAIN="$TEST_DIR/signing.keychain-db"
KEYCHAIN_PASSWORD=$(openssl rand -hex 24)
cleanup() {
  security list-keychains -d user -s "$HOME/Library/Keychains/login.keychain-db" /Library/Keychains/System.keychain >/dev/null 2>&1 || true
  security remove-trusted-cert "$TEST_DIR/cert.pem" >/dev/null 2>&1 || true
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT
printf '%s' "$LINGGAO_MAC_P12_BASE64" | base64 -D > "$TEST_DIR/cert.p12"
unset LINGGAO_MAC_P12_BASE64
chmod 600 "$TEST_DIR/cert.p12"
if openssl pkcs12 -help 2>&1 | grep -q -- '-legacy'; then
  openssl pkcs12 -legacy -in "$TEST_DIR/cert.p12" -passin env:LINGGAO_MAC_P12_PASSWORD -clcerts -nokeys -out "$TEST_DIR/cert.pem"
else
  openssl pkcs12 -in "$TEST_DIR/cert.p12" -passin env:LINGGAO_MAC_P12_PASSWORD -clcerts -nokeys -out "$TEST_DIR/cert.pem"
fi
FINGERPRINT=$(openssl x509 -in "$TEST_DIR/cert.pem" -noout -fingerprint -sha1 | sed 's/.*=//;s/://g' | tr '[:lower:]' '[:upper:]')
EXPECTED=$(printf '%s' "$LINGGAO_MAC_CERT_SHA1" | tr '[:lower:]' '[:upper:]')
[[ "$FINGERPRINT" == "$EXPECTED" ]] || { echo 'Signing certificate fingerprint does not match.' >&2; exit 1; }
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$TEST_DIR/cert.p12" -k "$KEYCHAIN" -P "$LINGGAO_MAC_P12_PASSWORD" -T /usr/bin/codesign >/dev/null
unset LINGGAO_MAC_P12_PASSWORD
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$TEST_DIR/cert.pem"
security list-keychains -d user -s "$KEYCHAIN" "$HOME/Library/Keychains/login.keychain-db" /Library/Keychains/System.keychain
security find-identity -v -p codesigning "$KEYCHAIN" | grep -Fiq "$FINGERPRINT" || { echo 'Signing identity is unavailable.' >&2; exit 1; }
npx --yes electron-builder@26.0.12 --mac "$1" --publish never -c.mac.identity="$FINGERPRINT" -c.forceCodeSigning=true
if [[ "$1" == '--arm64' ]]; then APP='dist/mac-arm64/灵稿 AI.app'; else APP='dist/mac/灵稿 AI.app'; fi
codesign --verify --deep --strict "$APP"
codesign -d --extract-certificates="$TEST_DIR/signing-cert" "$APP" 2>/dev/null
SIGNED_FINGERPRINT=$(openssl x509 -inform der -in "$TEST_DIR/signing-cert0" -noout -fingerprint -sha1 | sed 's/.*=//;s/://g' | tr '[:lower:]' '[:upper:]')
[[ "$SIGNED_FINGERPRINT" == "$FINGERPRINT" ]] || { echo 'Application signature does not match the fixed certificate.' >&2; exit 1; }
