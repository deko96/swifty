// Package supervisor manages the lifecycle of game server processes.
//
// Implementations must isolate each server behind its own unprivileged Unix
// user and a cgroup v2 resource scope; the reference implementation launches
// processes as transient systemd units. The interface is OS-agnostic so a
// Windows implementation (job objects) can be added without touching callers.
package supervisor

import "context"

// State describes a supervised server process.
type State string

const (
	StateOffline    State = "offline"
	StateInstalling State = "installing"
	StateStarting   State = "starting"
	StateRunning    State = "running"
	StateStopping   State = "stopping"
	StateCrashed    State = "crashed"
)

// Limits are per-server resource ceilings enforced by the supervisor.
type Limits struct {
	CPUPercent int // 100 = one full core
	MemoryMiB  int64
	DiskMiB    int64
	Pids       int
}

// Spec is everything needed to run one game server.
type Spec struct {
	ID        string // server UUID, also the systemd unit suffix
	UnixUser  string // dedicated user the process runs as
	Directory string // server root, the user's home
	Command   []string
	Env       map[string]string
	Limits    Limits
}

// Supervisor manages game server processes on this node.
type Supervisor interface {
	Start(ctx context.Context, spec Spec) error
	// Stop attempts the template's graceful stop command first, then
	// SIGTERM, then SIGKILL after the grace period expires.
	Stop(ctx context.Context, id string) error
	Kill(ctx context.Context, id string) error
	State(ctx context.Context, id string) (State, error)
}
