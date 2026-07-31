// Package agent defines the wire protocol of the panel ⇄ daemon channel:
// JSON messages in an { event, data } envelope, commands flowing down and
// events flowing up. The TypeScript source of truth is @swifty/sdk
// (packages/sdk/src/agent.ts); the fixtures under packages/sdk/fixtures/agent
// pin both implementations to the same wire format.
package agent

import (
	"encoding/json"

	"github.com/deko96/swifty/daemon/internal/supervisor"
)

const ProtocolVersion = 1

// PowerAction is the panel-facing vocabulary of server power commands.
type PowerAction string

const (
	PowerStart   PowerAction = "start"
	PowerRestart PowerAction = "restart"
	PowerStop    PowerAction = "stop"
	PowerKill    PowerAction = "kill"
)

// Command names (panel → daemon) carried in the envelope's event field.
const (
	CommandPower   = "power"
	CommandInstall = "install"
	CommandSync    = "sync"
)

// Event names (daemon → panel) carried in the envelope's event field.
const (
	EventHello           = "hello"
	EventState           = "state"
	EventInstallProgress = "install.progress"
	EventResult          = "result"
)

// PortProtocol qualifies a probed port in the hello event.
type PortProtocol string

const (
	PortTCP PortProtocol = "tcp"
	PortUDP PortProtocol = "udp"
)

// Envelope is the outer message shape; Data decodes into the typed struct
// matching Event.
type Envelope struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

// Meta is embedded in every message's data.
type Meta struct {
	V  int    `json:"v"`
	ID string `json:"id"`
}

// Limits are per-server resource ceilings as carried on the wire.
type Limits struct {
	CPUPercent int   `json:"cpuPercent"`
	MemoryMiB  int64 `json:"memoryMiB"`
	DiskMiB    int64 `json:"diskMiB"`
	Pids       int   `json:"pids"`
}

// Supervisor converts wire limits to the supervisor's type.
func (l Limits) Supervisor() supervisor.Limits {
	return supervisor.Limits{
		CPUPercent: l.CPUPercent,
		MemoryMiB:  l.MemoryMiB,
		DiskMiB:    l.DiskMiB,
		Pids:       l.Pids,
	}
}

type PowerCommand struct {
	Meta
	ServerID string            `json:"serverId"`
	Action   PowerAction       `json:"action"`
	Command  []string          `json:"command,omitempty"`
	Env      map[string]string `json:"env,omitempty"`
	Limits   *Limits           `json:"limits,omitempty"`
}

type InstallCommand struct {
	Meta
	ServerID string            `json:"serverId"`
	Script   string            `json:"script"`
	Env      map[string]string `json:"env,omitempty"`
}

// DesiredServer is one server's desired state, pushed in sync whenever the
// channel (re)connects so the daemon can reconcile after a panel outage.
type DesiredServer struct {
	ServerID  string `json:"serverId"`
	Autostart bool   `json:"autostart"`
	Suspended bool   `json:"suspended"`
}

type SyncCommand struct {
	Meta
	Servers []DesiredServer `json:"servers"`
}

type HardwareInventory struct {
	Hostname  string `json:"hostname"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	CPUModel  string `json:"cpuModel"`
	CPUCores  int    `json:"cpuCores"`
	MemoryMiB int64  `json:"memoryMiB"`
	DiskMiB   int64  `json:"diskMiB"`
}

// PortProbe is the result of the daemon probing one of its own ports.
type PortProbe struct {
	Protocol PortProtocol `json:"protocol"`
	Port     int          `json:"port"`
	Open     bool         `json:"open"`
}

type HelloEvent struct {
	Meta
	Protocol      int               `json:"protocol"`
	DaemonVersion string            `json:"daemonVersion"`
	Inventory     HardwareInventory `json:"inventory"`
	Ports         []PortProbe       `json:"ports"`
}

type StateEvent struct {
	Meta
	ServerID string           `json:"serverId"`
	State    supervisor.State `json:"state"`
	ExitCode *int             `json:"exitCode,omitempty"`
}

type InstallProgressEvent struct {
	Meta
	ServerID string `json:"serverId"`
	Line     string `json:"line"`
}

type ResultEvent struct {
	Meta
	CommandID string `json:"commandId"`
	OK        bool   `json:"ok"`
	Error     string `json:"error,omitempty"`
	Output    string `json:"output,omitempty"`
}
