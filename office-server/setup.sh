#!/usr/bin/env bash
# Pixel Office setup script — run once to configure credentials + tunnel

set -e
cd "$(dirname "$0")"

echo "=== Pixel Office Setup ==="

# 1. Generate password
PASSWORD=$(openssl rand -base64 24 | tr -d '=/+' | head -c 32)
HASH=$(echo -n "$PASSWORD" | shasum -a 256 | awk '{print $1}')

CREDS_FILE="$HOME/.openclaw/office-credentials.json"
cat > "$CREDS_FILE" <<EOF
{
  "username": "remi",
  "passwordHash": "$HASH"
}
EOF
echo "✅ Credentials saved to $CREDS_FILE"

# 2. Try to save to pass
if command -v pass &>/dev/null; then
  echo "$PASSWORD" | pass insert -f niavoice/office-password && echo "✅ Password saved to pass store" || true
fi

# 3. Write plaintext fallback
PLAIN_FILE="$HOME/.openclaw/workspace/office-credentials.txt"
cat > "$PLAIN_FILE" <<EOF
Pixel Office Dashboard
URL: https://office.niavoice.com
Username: remi
Password: $PASSWORD
EOF
echo "✅ Plaintext credentials written to $PLAIN_FILE"

echo ""
echo "Password: $PASSWORD"
echo ""
echo "Run 'npm start' to test locally, then run setup-tunnel.sh to configure cloudflared."
