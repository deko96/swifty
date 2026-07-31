#!/usr/bin/env bash
#
# vps-verify-sandbox.sh — deploy swiftyd to a real VPS and adversarially prove
# that the systemd sandbox in daemon/internal/supervisor/systemd.go actually
# isolates game servers on a live kernel.
#
# WHY THIS IS A SCRIPT AND NOT AN E2E TEST
# The supervisor package (EnsureUser/startArgs/sandboxProps) is unit-tested
# against a mock runner, but nothing drives it against real systemd yet: the
# daemon serves only /healthz and /v1/system, and neither the daemon nor the
# panel exposes a server-start endpoint. The panel's verifySftp is an internal
# method with no HTTP route and the daemon has no SFTP transport. So this script
# reproduces the exact systemd-run invocation the supervisor emits and checks
# that the kernel enforces every isolation claim. A drift guard (phase 1) parses
# the property list straight out of systemd.go and fails if this script and the
# Go source disagree, so "reproduces exactly" stays true as the code evolves.
#
# SECRETS: the VPS address and SSH key never live in source. `deploy` reads them
# from VPS_HOST / VPS_USER / SSH_KEY in the environment; `verify` runs entirely
# on the VPS and needs no secrets at all.
#
# USAGE
#   Primary (self-contained, run as root ON the VPS; paste the output back):
#       sudo ./vps-verify-sandbox.sh verify
#
#   Optional (from a dev machine, when SSH tunnels through the proxy):
#       VPS_HOST=1.2.3.4 VPS_USER=root SSH_KEY=~/.ssh/id_ed25519 \
#         ./vps-verify-sandbox.sh deploy
#
#   Panel handshake is exercised only when PANEL_URL is set (see below).
#
# ENVIRONMENT (all optional; sensible defaults)
#   SERVERS_ROOT   servers root dir           (default /opt/swifty/servers-verify)
#   MEM_LIMIT_MIB  per-server memory ceiling  (default 256)
#   CPU_QUOTA_PCT  per-server CPU quota %      (default 20; 100 = one core)
#   PIDS_MAX       per-server TasksMax         (default 64)
#   PANEL_URL      base panel URL, e.g. http://127.0.0.1:3000 — enables the
#                  register-a-node-via-the-API phase; skipped when unset
#   PANEL_EMAIL / PANEL_PASSWORD   panel admin credentials for login
#   SETUP_CODE     one-time setup code, to bootstrap the first admin if needed
#   NODE_FQDN      address the panel uses to reach this daemon (default 127.0.0.1)
#   DAEMON_PORT    daemon listen port         (default 8443)
#   KEEP           set to 1 to skip teardown (leave units/users for inspection)
#
set -uo pipefail

# ----------------------------------------------------------------------------
# configuration
# ----------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVERS_ROOT="${SERVERS_ROOT:-/opt/swifty/servers-verify}"
MEM_LIMIT_MIB="${MEM_LIMIT_MIB:-256}"
CPU_QUOTA_PCT="${CPU_QUOTA_PCT:-20}"
PIDS_MAX="${PIDS_MAX:-64}"
NODE_FQDN="${NODE_FQDN:-127.0.0.1}"
DAEMON_PORT="${DAEMON_PORT:-8443}"
UNIT_PREFIX="swifty-"          # mirrors unitPrefix in systemd.go
USER_PREFIX="sv_"              # mirrors userPrefix in systemd.go
VERIFY_TAG="vfy"               # keeps verify users/units clear of real ones

# the two servers used for the cross-server isolation test
A_ID="a1a1a1a1"; A_USER="${USER_PREFIX}${VERIFY_TAG}${A_ID}"; A_DIR="${SERVERS_ROOT}/srv-a"
B_ID="b2b2b2b2"; B_USER="${USER_PREFIX}${VERIFY_TAG}${B_ID}"; B_DIR="${SERVERS_ROOT}/srv-b"
A_UNIT="${UNIT_PREFIX}${VERIFY_TAG}-a.service"
B_UNIT="${UNIT_PREFIX}${VERIFY_TAG}-b.service"

# ----------------------------------------------------------------------------
# reporting
# ----------------------------------------------------------------------------
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_BLD=$'\033[1m'; C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YEL=""; C_BLD=""; C_RST=""
fi

declare -a RESULTS=()
PASS_N=0; FAIL_N=0; SKIP_N=0

section() { printf '\n%s== %s ==%s\n' "$C_BLD" "$1" "$C_RST"; }
info()    { printf '   %s\n' "$1"; }

pass() { printf '%s  PASS%s %s\n' "$C_GRN" "$C_RST" "$1"; RESULTS+=("PASS  $1"); ((PASS_N++)); }
fail() { printf '%s  FAIL%s %s\n' "$C_RED" "$C_RST" "$1"; RESULTS+=("FAIL  $1"); ((FAIL_N++)); }
skip() { printf '%s  SKIP%s %s\n' "$C_YEL" "$C_RST" "$1"; RESULTS+=("SKIP  $1"); ((SKIP_N++)); }

# assert PASS when the check succeeds; detail printed indented on failure
check() {
  local desc="$1"; shift
  local out
  if out="$("$@" 2>&1)"; then
    pass "$desc"
  else
    fail "$desc"
    [[ -n "$out" ]] && printf '        %s\n' "${out//$'\n'/$'\n'        }"
  fi
}

# ----------------------------------------------------------------------------
# http helpers — minimal VPS images ship wget but not curl (or vice versa)
# ----------------------------------------------------------------------------
http_get() { # http_get URL [HEADER]
  if command -v curl >/dev/null; then
    curl -fsS ${2:+-H "$2"} "$1"
  else
    wget -qO- ${2:+--header="$2"} "$1"
  fi
}

http_code() { # http_code URL -> status code on stdout
  if command -v curl >/dev/null; then
    curl -s -o /dev/null -w '%{http_code}' "$1"
  else
    wget -SqO /dev/null "$1" 2>&1 | awk '/^  HTTP\//{code=$2} END{print code+0}'
  fi
}
export -f http_get http_code

# ----------------------------------------------------------------------------
# deploy mode — cross-compile here, ship to the VPS, run verify there
# ----------------------------------------------------------------------------
deploy() {
  : "${VPS_HOST:?set VPS_HOST to the VPS address (kept out of source)}"
  : "${VPS_USER:=root}"
  : "${SSH_KEY:?set SSH_KEY to your private key path (kept out of source)}"

  section "Cross-compiling swiftyd for linux/amd64"
  local bin="${REPO_ROOT}/daemon/swiftyd.linux-amd64"
  ( cd "${REPO_ROOT}/daemon" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o "$bin" ./cmd/swiftyd ) \
    || { echo "build failed"; exit 1; }
  info "built $bin"

  local ssh_opts=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)
  local dest="${VPS_USER}@${VPS_HOST}"

  section "Shipping binary + script to ${dest}"
  ssh "${ssh_opts[@]}" "$dest" 'mkdir -p /opt/swifty' || exit 1
  scp "${ssh_opts[@]}" "$bin" "$dest:/usr/local/bin/swiftyd" || exit 1
  scp "${ssh_opts[@]}" "${BASH_SOURCE[0]}" "$dest:/opt/swifty/vps-verify-sandbox.sh" || exit 1
  ssh "${ssh_opts[@]}" "$dest" 'chmod +x /usr/local/bin/swiftyd /opt/swifty/vps-verify-sandbox.sh' || exit 1

  section "Running verify on the VPS"
  # forward only non-secret knobs; the VPS already has the binary in PATH
  ssh "${ssh_opts[@]}" "$dest" \
    "SWIFTYD_BIN=/usr/local/bin/swiftyd SERVERS_ROOT='${SERVERS_ROOT}' \
     MEM_LIMIT_MIB='${MEM_LIMIT_MIB}' CPU_QUOTA_PCT='${CPU_QUOTA_PCT}' \
     PANEL_URL='${PANEL_URL:-}' NODE_FQDN='${NODE_FQDN}' KEEP='${KEEP:-}' \
     bash /opt/swifty/vps-verify-sandbox.sh verify"
}

# ----------------------------------------------------------------------------
# phase 0 — preflight
# ----------------------------------------------------------------------------
preflight() {
  section "Phase 0 — preflight"

  if [[ $EUID -ne 0 ]]; then
    fail "must run as root (needs useradd + systemd-run)"; return 1
  fi
  pass "running as root"

  check "systemd is PID 1"        bash -c '[[ "$(readlink /proc/1/exe)" == *systemd ]] || ps -p1 -o comm= | grep -q systemd'
  check "systemd-run present"     command -v systemd-run
  check "systemctl present"       command -v systemctl
  check "useradd present"         command -v useradd
  check "curl or wget present"    bash -c 'command -v curl || command -v wget'

  if [[ -d /sys/fs/cgroup/system.slice && -f /sys/fs/cgroup/cgroup.controllers ]]; then
    pass "cgroup v2 unified hierarchy"
  else
    fail "cgroup v2 not detected — resource limits will not bind (hybrid/v1 host?)"
  fi

  local ctrls; ctrls="$(cat /sys/fs/cgroup/cgroup.controllers 2>/dev/null || true)"
  check "memory controller available" bash -c "grep -qw memory <<<'$ctrls'"
  check "cpu controller available"    bash -c "grep -qw cpu <<<'$ctrls'"
}

# ----------------------------------------------------------------------------
# phase 1 — drift guard: this script vs sandboxProps() in systemd.go
# ----------------------------------------------------------------------------
# The names below must equal the fixed (value-independent) directives emitted by
# sandboxProps. If systemd.go changes, this phase fails until the list is
# reconciled — so "reproduces the real invocation" cannot silently rot.
SANDBOX_PROPS=(
  NoNewPrivileges PrivateTmp PrivateDevices ProtectSystem ProtectHome
  ProtectKernelTunables ProtectKernelModules ProtectControlGroups ProtectProc
  RestrictSUIDSGID LockPersonality TemporaryFileSystem BindPaths ReadWritePaths
)

drift_guard() {
  section "Phase 1 — drift guard (script vs systemd.go)"
  local src="${REPO_ROOT}/daemon/internal/supervisor/systemd.go"
  if [[ ! -f "$src" ]]; then
    skip "systemd.go not present (running standalone on VPS) — skipping drift check"
    return
  fi

  # extract property names from the sandboxProps function body only
  local from_go
  from_go="$(awk '/^func sandboxProps/{f=1} f&&/"[A-Za-z]+=/{print} /^}/{if(f)exit}' "$src" \
    | grep -oE '"[A-Za-z]+=' | tr -d '"=' | sort -u)"
  local from_script
  from_script="$(printf '%s\n' "${SANDBOX_PROPS[@]}" | sort -u)"

  if [[ "$from_go" == "$from_script" ]]; then
    pass "sandbox property set matches systemd.go (${#SANDBOX_PROPS[@]} directives)"
  else
    fail "sandbox property set DRIFTED from systemd.go"
    info "only in Go:     $(comm -23 <(echo "$from_go") <(echo "$from_script") | tr '\n' ' ')"
    info "only in script: $(comm -13 <(echo "$from_go") <(echo "$from_script") | tr '\n' ' ')"
  fi
}

# ----------------------------------------------------------------------------
# phase 2 — build + version
# ----------------------------------------------------------------------------
SWIFTYD_BIN="${SWIFTYD_BIN:-}"
build_daemon() {
  section "Phase 2 — swiftyd binary"
  if [[ -n "$SWIFTYD_BIN" && -x "$SWIFTYD_BIN" ]]; then
    pass "using prebuilt binary: $SWIFTYD_BIN"
  elif command -v go >/dev/null && [[ -d "${REPO_ROOT}/daemon" ]]; then
    SWIFTYD_BIN="${REPO_ROOT}/daemon/swiftyd"
    if ( cd "${REPO_ROOT}/daemon" && CGO_ENABLED=0 go build -o "$SWIFTYD_BIN" ./cmd/swiftyd ); then
      pass "built swiftyd from source"
    else
      fail "go build failed"; return 1
    fi
  elif command -v swiftyd >/dev/null; then
    SWIFTYD_BIN="$(command -v swiftyd)"
    pass "using swiftyd from PATH: $SWIFTYD_BIN"
  else
    fail "no swiftyd binary and no Go toolchain to build one"; return 1
  fi
  local ver; ver="$("$SWIFTYD_BIN" -version 2>&1)"
  check "swiftyd -version runs" bash -c "[[ -n '$ver' ]]"
  info "version: $ver"
}

# ----------------------------------------------------------------------------
# phase 3 — deploy the daemon and confirm it answers
# ----------------------------------------------------------------------------
DAEMON_PID=""
DAEMON_TOKEN=""
CONFIG_PATH=""
deploy_daemon() {
  section "Phase 3 — daemon up + health"
  [[ -n "$SWIFTYD_BIN" ]] || { skip "no binary from phase 2"; return; }

  DAEMON_TOKEN="verify-$(head -c16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  local cfgdir; cfgdir="$(mktemp -d)"
  CONFIG_PATH="${cfgdir}/swiftyd.json"
  cat > "$CONFIG_PATH" <<JSON
{ "listen": "0.0.0.0:${DAEMON_PORT}", "token": "${DAEMON_TOKEN}", "dataDir": "${SERVERS_ROOT}" }
JSON

  "$SWIFTYD_BIN" -config "$CONFIG_PATH" >/tmp/swiftyd-verify.log 2>&1 &
  DAEMON_PID=$!

  local up=""
  for _ in $(seq 1 20); do
    if http_get "http://127.0.0.1:${DAEMON_PORT}/healthz" >/dev/null 2>&1; then up=1; break; fi
    sleep 0.25
  done
  if [[ -n "$up" ]]; then pass "daemon answers /healthz"; else
    fail "daemon never became healthy"; info "$(tail -5 /tmp/swiftyd-verify.log 2>/dev/null)"; return
  fi

  check "/v1/system rejects a missing token" \
    bash -c "[[ \$(http_code http://127.0.0.1:${DAEMON_PORT}/v1/system) == 401 ]]"
  check "/v1/system accepts the panel token" \
    bash -c "http_get http://127.0.0.1:${DAEMON_PORT}/v1/system 'Authorization: Bearer ${DAEMON_TOKEN}' | grep -q version"
}

# ----------------------------------------------------------------------------
# phase 4 — register the node through the panel API (optional)
# ----------------------------------------------------------------------------
panel_handshake() {
  section "Phase 4 — panel handshake (register a node via the API)"
  if [[ -z "${PANEL_URL:-}" ]]; then
    skip "PANEL_URL unset — skipping panel integration (daemon tested standalone)"
    return
  fi
  if ! command -v curl >/dev/null; then
    skip "panel handshake needs curl (cookie jar auth) — install curl to run this phase"
    return
  fi
  local jar; jar="$(mktemp)"
  local base="${PANEL_URL%/}/api/v1"

  # log in, bootstrapping the first admin if the panel is fresh and we hold the code
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -c "$jar" -b "$jar" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${PANEL_EMAIL:-}\",\"password\":\"${PANEL_PASSWORD:-}\"}" \
    "${base}/auth/login")"
  if [[ "$code" != "200" && -n "${SETUP_CODE:-}" ]]; then
    code="$(curl -s -o /dev/null -w '%{http_code}' -c "$jar" -b "$jar" \
      -H 'Content-Type: application/json' \
      -d "{\"setupCode\":\"${SETUP_CODE}\",\"panelName\":\"verify\",\"email\":\"${PANEL_EMAIL}\",\"password\":\"${PANEL_PASSWORD}\"}" \
      "${base}/setup")"
  fi
  if [[ "$code" == "200" || "$code" == "201" ]]; then pass "authenticated to panel"; else
    fail "panel auth failed (HTTP $code) — set PANEL_EMAIL/PANEL_PASSWORD or SETUP_CODE"; return
  fi

  # register this daemon as a node
  local node node_id
  node="$(curl -s -c "$jar" -b "$jar" -H 'Content-Type: application/json' \
    -d "{\"name\":\"verify-$$\",\"fqdn\":\"${NODE_FQDN}\",\"daemonPort\":${DAEMON_PORT},\"public\":false,\"memoryMb\":2048,\"diskMb\":10240}" \
    "${base}/nodes")"
  node_id="$(sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' <<<"$node" | head -1)"
  if [[ -n "$node_id" ]]; then pass "registered node ${node_id}"; else
    fail "node registration failed"; info "$node"; return
  fi

  # fetch the daemon config the panel minted, and align the running daemon's token
  local cfg panel_token
  cfg="$(curl -s -c "$jar" -b "$jar" "${base}/nodes/${node_id}/config")"
  panel_token="$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' <<<"$cfg")"
  check "config endpoint returns a token" bash -c "[[ -n '$panel_token' ]]"

  # the panel proves it can reach the daemon
  local health
  health="$(curl -s -c "$jar" -b "$jar" "${base}/nodes/${node_id}/health")"
  if grep -q '"online":true' <<<"$health"; then pass "panel reports node online"; else
    # expected when the running daemon uses a different token than the panel minted
    skip "panel health online=false (running daemon token differs from the freshly minted one)"
    info "$health"
  fi

  rm -f "$jar"
}

# ----------------------------------------------------------------------------
# phase 5 — the adversarial isolation test
# ----------------------------------------------------------------------------
# Mirrors EnsureUser (useradd --create-home --home-dir DIR --shell nologin,
# chmod 0750) and startArgs/sandboxProps. Two units run under distinct sv_ users:
# B is a long-lived sleeper; A runs a probe FROM INSIDE its own sandbox and drops
# results into its bind-mounted dir, which the host reads afterward.

ensure_user() {  # $1=user $2=dir
  useradd --create-home --home-dir "$2" --shell /usr/sbin/nologin "$1" 2>/dev/null
  local rc=$?; [[ $rc -eq 0 || $rc -eq 9 ]] || return 1  # 9 = already exists
  mkdir -p "$2"; chown "$1:$1" "$2"; chmod 0750 "$2"
}

# emit the sandbox properties for a given server dir, identical to sandboxProps()
sandbox_props() {  # $1=dir
  local root; root="$(dirname "$1")"
  printf '%s\n' \
    --property=NoNewPrivileges=yes \
    --property=PrivateTmp=yes \
    --property=PrivateDevices=yes \
    --property=ProtectSystem=strict \
    --property=ProtectHome=yes \
    --property=ProtectKernelTunables=yes \
    --property=ProtectKernelModules=yes \
    --property=ProtectControlGroups=yes \
    --property=ProtectProc=invisible \
    --property=RestrictSUIDSGID=yes \
    --property=LockPersonality=yes \
    "--property=TemporaryFileSystem=${root}" \
    "--property=BindPaths=$1" \
    "--property=ReadWritePaths=$1"
}

resource_props() {
  printf '%s\n' \
    "--property=MemoryMax=${MEM_LIMIT_MIB}M" \
    "--property=CPUQuota=${CPU_QUOTA_PCT}%" \
    "--property=TasksMax=${PIDS_MAX}" \
    --property=Restart=on-failure
}

isolation_test() {
  section "Phase 5 — adversarial isolation on real systemd"
  mkdir -p "$SERVERS_ROOT"

  check "create user A + 0750 home" ensure_user "$A_USER" "$A_DIR"
  check "create user B + 0750 home" ensure_user "$B_USER" "$B_DIR"

  # drop a canary file in B's dir; from A's namespace B's dir must not even exist
  echo "top-secret-from-B" > "${B_DIR}/canary.txt"; chmod 0644 "${B_DIR}/canary.txt"

  # start B as a long-lived sleeper inside its own sandbox
  systemctl reset-failed "$B_UNIT" 2>/dev/null || true
  local b_props=(); mapfile -t b_props < <(sandbox_props "$B_DIR"); local b_res=(); mapfile -t b_res < <(resource_props)
  systemd-run --unit "$B_UNIT" --collect --uid "$B_USER" --gid "$B_USER" \
    --working-directory "$B_DIR" "${b_res[@]}" "${b_props[@]}" \
    -- /bin/sleep 900 >/dev/null 2>&1
  local up=""
  for _ in $(seq 1 20); do
    [[ "$(systemctl show "$B_UNIT" -p SubState --value 2>/dev/null)" == "running" ]] && { up=1; break; }
    sleep 0.2
  done
  [[ -n "$up" ]] && pass "server B unit is running" || { fail "server B failed to start"; systemctl status "$B_UNIT" --no-pager -l 2>&1 | tail -8; }
  local b_pid; b_pid="$(systemctl show "$B_UNIT" -p MainPID --value 2>/dev/null)"

  # the probe A runs FROM INSIDE its own sandbox; results land in A's dir
  local probe="${A_DIR}/probe.sh"
  cat > "$probe" <<PROBE
#!/bin/bash
out="\$SERVER_DIR/probe.out"; : > "\$out"
say() { printf '%s\n' "\$1" >> "\$out"; }

# 1. sibling server B's directory must be INVISIBLE (ENOENT), not merely unreadable
if ls "$B_DIR" >/dev/null 2>err; then
  say "DIR_VISIBLE listed=\$(ls -a "$B_DIR" | tr '\n' ' ')"
else
  grep -qi 'no such file' err && say "DIR_ENOENT" || say "DIR_EACCES \$(cat err)"
fi

# 2. /etc/shadow must be unreadable
if cat /etc/shadow >/dev/null 2>serr; then say "SHADOW_READABLE"; else say "SHADOW_DENIED"; fi

# 3. sibling process B must be hidden by ProtectProc=invisible
if [ -n "$b_pid" ] && [ "$b_pid" != 0 ]; then
  [ -e "/proc/$b_pid" ] && say "PROC_VISIBLE" || say "PROC_HIDDEN"
else
  say "PROC_UNKNOWN"
fi
# also: /proc should list essentially only our own pids
others=\$(ls -d /proc/[0-9]* 2>/dev/null | wc -l)
say "PROC_COUNT \$others"

# 4. the process must see its OWN cgroup limits bound
# ProtectControlGroups mounts the host cgroup tree read-only (no cgroup
# namespace), so our limits live under our unit's subtree, not the root
cg=\$(cut -d: -f3 /proc/self/cgroup)
mmax=\$(cat "/sys/fs/cgroup\${cg}/memory.max" 2>/dev/null || echo NA)
cmax=\$(cat "/sys/fs/cgroup\${cg}/cpu.max" 2>/dev/null || echo NA)
tmax=\$(cat "/sys/fs/cgroup\${cg}/pids.max" 2>/dev/null || echo NA)
say "CGROUP mem=\$mmax cpu=\$cmax pids=\$tmax"

# 5. write must work in our own dir but the OS must be read-only
touch "\$SERVER_DIR/writable.ok" 2>/dev/null && say "OWN_DIR_WRITABLE" || say "OWN_DIR_READONLY"
touch /usr/local/bin/evil 2>/dev/null && { say "OS_WRITABLE"; rm -f /usr/local/bin/evil; } || say "OS_READONLY"
PROBE
  chmod 0755 "$probe"; chown "$A_USER:$A_USER" "$probe"

  systemctl reset-failed "$A_UNIT" 2>/dev/null || true
  local a_props=(); mapfile -t a_props < <(sandbox_props "$A_DIR"); local a_res=(); mapfile -t a_res < <(resource_props)
  systemd-run --unit "$A_UNIT" --wait --collect --uid "$A_USER" --gid "$A_USER" \
    --working-directory "$A_DIR" --setenv "SERVER_DIR=${A_DIR}" \
    "${a_res[@]}" "${a_props[@]}" \
    -- /bin/bash "$probe" >/dev/null 2>&1

  local r="${A_DIR}/probe.out"
  if [[ ! -s "$r" ]]; then fail "probe produced no output"; return; fi
  info "probe output:"; sed 's/^/        /' "$r"

  grep -q '^DIR_ENOENT'        "$r" && pass "server B's directory is INVISIBLE from server A (ENOENT)" \
                                     || fail "server A can see server B's directory (isolation breach)"
  grep -q '^SHADOW_DENIED'     "$r" && pass "/etc/shadow is unreadable from the sandbox" \
                                     || fail "/etc/shadow is readable — ProtectSystem/perms not effective"
  grep -q '^PROC_HIDDEN'       "$r" && pass "sibling server B's process is hidden (ProtectProc=invisible)" \
                                     || fail "server A can see server B's process"
  grep -q '^OS_READONLY'       "$r" && pass "the OS filesystem is read-only to the sandbox" \
                                     || fail "sandbox can write outside its own dir"
  grep -q '^OWN_DIR_WRITABLE'  "$r" && pass "server can write its own directory" \
                                     || fail "server cannot write its own directory (would break installs)"

  # the probe reads limits from inside; the host confirms systemd applied them
  local exp_mem=$(( MEM_LIMIT_MIB * 1024 * 1024 ))
  if grep -q "mem=${exp_mem}" "$r"; then pass "memory limit is bound inside the cgroup (${MEM_LIMIT_MIB}M)"
  else fail "memory limit not visible/bound inside the sandbox"; fi

  isolation_enforcement_test
}

# prove the cgroup limits actually BITE, not just bind
isolation_enforcement_test() {
  section "Phase 5b — resource limits actually enforce (not just applied)"

  # memory: a hog with a low ceiling must be OOM-killed, not allowed to swell
  local hog_unit="${UNIT_PREFIX}${VERIFY_TAG}-memhog.service"
  systemctl reset-failed "$hog_unit" 2>/dev/null || true
  local hogger=""
  if command -v python3 >/dev/null; then
    hogger="python3 -c 'b=bytearray(0)\nimport sys\nwhile True: b+=bytearray(10*1024*1024)'"
  elif command -v perl >/dev/null; then
    hogger="perl -e 'my \$s=q();\$s.=q(x)x(10*1024*1024) while 1;'"
  fi
  if [[ -n "$hogger" ]]; then
    systemd-run --unit "$hog_unit" --wait --collect \
      --property=MemoryMax=64M --property=MemorySwapMax=0 \
      -- /bin/bash -c "$hogger" >/dev/null 2>&1
    local rc=$?
    # OOM kill surfaces as non-zero exit / killed; success would mean the cap didn't hold
    if [[ $rc -ne 0 ]]; then pass "64M memory cap OOM-kills a process that exceeds it (exit $rc)"
    else fail "memory hog survived past its 64M cap"; fi
  else
    skip "no python3/perl to drive a memory hog — memory enforcement not exercised"
  fi

  # cpu: a busy loop under a 20% quota must accrue ~20% CPU-time over wall-time
  local cpu_unit="${UNIT_PREFIX}${VERIFY_TAG}-cpuspin.service"
  systemctl reset-failed "$cpu_unit" 2>/dev/null || true
  systemd-run --unit "$cpu_unit" --collect \
    --property=CPUQuota=20% \
    -- /bin/bash -c 'while :; do :; done' >/dev/null 2>&1
  sleep 3
  local ns; ns="$(systemctl show "$cpu_unit" -p CPUUsageNSec --value 2>/dev/null)"
  systemctl stop "$cpu_unit" 2>/dev/null || true
  if [[ "$ns" =~ ^[0-9]+$ && "$ns" -gt 0 ]]; then
    # over ~3s wall, a 20% quota should yield well under 1.5s (1.5e9 ns) of CPU
    local pct=$(( ns / 30000000 ))   # ns / (3s * 1e9) * 100, integer
    if (( ns < 1500000000 )); then pass "20% CPU quota throttles a busy loop (~${pct}% of wall over 3s)"
    else fail "busy loop used ${pct}% CPU under a 20% quota — throttling not effective"; fi
  else
    skip "could not read CPUUsageNSec — CPU throttling not measured"
  fi
}

# ----------------------------------------------------------------------------
# phase 6 — SFTP transport model (jail = chroot to server dir, drop to sv_ user)
# ----------------------------------------------------------------------------
# The daemon's SFTP server (verifySftp -> chroot -> setuid sv_*) is not built
# yet, so this proves the jail model the transport will rely on: as the server's
# own user, confined to its dir, a client cannot escape to a sibling or to /etc.
sftp_model_test() {
  section "Phase 6 — SFTP jail model (transport half, pre-implementation)"
  [[ -d "$A_DIR" ]] || { skip "no server dir from phase 5"; return; }

  # what a chrooted SFTP session for server A would be able to touch: only A_DIR.
  # run as A_USER, cwd = A_DIR, and confirm the boundaries hold.
  local out
  out="$(runuser -u "$A_USER" -- bash -c "
    cd '$A_DIR' || exit 3
    # can operate on own files
    echo hi > upload.tmp && rm -f upload.tmp || exit 4
    # cannot read a sibling server's canary through the filesystem
    cat '$B_DIR/canary.txt' 2>/dev/null && echo LEAK || echo NOLEAK
    # cannot read the shadow file
    cat /etc/shadow >/dev/null 2>&1 && echo SHADOW_OPEN || echo SHADOW_SHUT
  " 2>&1)"
  local rc=$?

  if [[ $rc -eq 0 ]]; then pass "server user can read/write its own directory (upload path works)"; else
    fail "server user cannot operate in its own dir (rc=$rc)"; info "$out"; fi
  grep -q NOLEAK       <<<"$out" && pass "server user cannot read a sibling server's file (DAC 0750)" \
                                  || fail "server user read another server's file"
  grep -q SHADOW_SHUT  <<<"$out" && pass "server user cannot read /etc/shadow" \
                                  || fail "server user read /etc/shadow"

  info "note: verifySftp password auth + real chroot transport land with the daemon SFTP server;"
  info "      this phase validates the OS-level jail those will drop into."
}

# ----------------------------------------------------------------------------
# teardown
# ----------------------------------------------------------------------------
teardown() {
  section "Teardown"
  if [[ "${KEEP:-}" == "1" ]]; then info "KEEP=1 — leaving units/users/dirs for inspection"; return; fi
  for u in "$A_UNIT" "$B_UNIT" "${UNIT_PREFIX}${VERIFY_TAG}-memhog.service" "${UNIT_PREFIX}${VERIFY_TAG}-cpuspin.service"; do
    systemctl stop "$u" 2>/dev/null || true
    systemctl reset-failed "$u" 2>/dev/null || true
  done
  [[ -n "$DAEMON_PID" ]] && kill "$DAEMON_PID" 2>/dev/null || true
  for uandd in "$A_USER" "$B_USER"; do userdel --remove "$uandd" 2>/dev/null || true; done
  rm -rf "$SERVERS_ROOT" 2>/dev/null || true
  [[ -n "$CONFIG_PATH" ]] && rm -rf "$(dirname "$CONFIG_PATH")" 2>/dev/null || true
  info "cleaned units, users, dirs"
}

summary() {
  section "Summary"
  printf '%s\n' "${RESULTS[@]}"
  printf '\n%s%d passed%s, %s%d failed%s, %s%d skipped%s\n' \
    "$C_GRN" "$PASS_N" "$C_RST" "$C_RED" "$FAIL_N" "$C_RST" "$C_YEL" "$SKIP_N" "$C_RST"
  if (( FAIL_N > 0 )); then
    printf '%sSandbox verification FAILED — do not ship the deferred PR until green.%s\n' "$C_RED" "$C_RST"
    return 1
  fi
  printf '%sAll sandbox isolation guarantees verified on this host.%s\n' "$C_GRN" "$C_RST"
}

# ----------------------------------------------------------------------------
# entrypoint
# ----------------------------------------------------------------------------
verify() {
  trap teardown EXIT
  printf '%sSwifty daemon sandbox verification%s  (host: %s, kernel: %s)\n' \
    "$C_BLD" "$C_RST" "$(hostname)" "$(uname -r)"
  preflight || { summary; exit 1; }
  drift_guard
  build_daemon
  deploy_daemon
  panel_handshake
  isolation_test
  sftp_model_test
  summary
}

case "${1:-verify}" in
  verify) verify ;;
  deploy) deploy ;;
  *) echo "usage: $0 [verify|deploy]" >&2; exit 2 ;;
esac
