const RELEASE_URL = 'https://github.com/deko96/swifty/releases/latest/download/swiftyd-linux-amd64';
const DAEMON_PATH = '/usr/local/bin/swiftyd';
const UNIT_PATH = '/etc/systemd/system/swiftyd.service';

/**
 * The one-line node installer: downloads the daemon release, registers this
 * machine with a one-time join token, and starts the daemon as a systemd
 * service. Served as text so `curl | sh -s -- --join <token>` works.
 */
export function renderInstallScript(panelUrl: string): string {
  return `#!/bin/sh
# Swifty node installer — run as root on the machine that will host game servers:
#   curl -sSL ${panelUrl}/api/v1/nodes/install-script | sh -s -- --join <token>
set -eu

PANEL_URL='${panelUrl}'
JOIN_TOKEN=''
INSECURE_TLS=''

while [ $# -gt 0 ]; do
  case "$1" in
    --join) JOIN_TOKEN="$2"; shift 2 ;;
    --panel) PANEL_URL="$2"; shift 2 ;;
    --insecure-tls) INSECURE_TLS='--insecure-tls'; shift ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$JOIN_TOKEN" ]; then
  echo 'usage: sh -s -- --join <token> [--panel <url>] [--insecure-tls]' >&2
  exit 1
fi
if [ "$(id -u)" != 0 ]; then
  echo 'the installer must run as root' >&2
  exit 1
fi

echo "downloading swiftyd from ${RELEASE_URL}"
curl -fsSL -o '${DAEMON_PATH}' '${RELEASE_URL}'
chmod 0755 '${DAEMON_PATH}'

echo "registering with $PANEL_URL"
'${DAEMON_PATH}' join --panel "$PANEL_URL" --token "$JOIN_TOKEN" $INSECURE_TLS

cat > '${UNIT_PATH}' <<'UNIT'
[Unit]
Description=Swifty node daemon
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${DAEMON_PATH}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now swiftyd
echo 'node joined — it will appear in the panel within seconds'
`;
}
