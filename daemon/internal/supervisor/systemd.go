package supervisor

import (
	"context"
	"fmt"
	"strings"
)

// Systemd supervises game servers as transient systemd units, each running
// as a dedicated unprivileged Unix user.
type Systemd struct {
	runner Runner
}

func NewSystemd() *Systemd {
	return &Systemd{runner: execRunner{}}
}

var _ Supervisor = (*Systemd)(nil)

func (s *Systemd) Start(ctx context.Context, spec Spec) error {
	out, code, err := s.runner.Run(ctx, "systemd-run", startArgs(spec)...)
	if err != nil {
		return err
	}
	if code != 0 {
		return fmt.Errorf("start %s: exit %d: %s", spec.ID, code, out)
	}
	return nil
}

func (s *Systemd) Stop(ctx context.Context, id string) error {
	out, code, err := s.runner.Run(ctx, "systemctl", "stop", UnitName(id))
	if err != nil {
		return err
	}
	if code != 0 {
		return fmt.Errorf("stop %s: exit %d: %s", id, code, out)
	}
	return nil
}

func (s *Systemd) Kill(ctx context.Context, id string) error {
	out, code, err := s.runner.Run(ctx, "systemctl", "kill", "--signal=SIGKILL", UnitName(id))
	if err != nil {
		return err
	}
	if code != 0 {
		return fmt.Errorf("kill %s: exit %d: %s", id, code, out)
	}
	return nil
}

func (s *Systemd) State(ctx context.Context, id string) (State, error) {
	out, _, err := s.runner.Run(ctx, "systemctl", "show", UnitName(id),
		"--property=ActiveState", "--property=SubState", "--value")
	if err != nil {
		return StateOffline, err
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	active := strings.TrimSpace(lines[0])
	switch active {
	case "active", "reloading":
		return StateRunning, nil
	case "activating":
		return StateStarting, nil
	case "deactivating":
		return StateStopping, nil
	case "failed":
		return StateCrashed, nil
	default:
		return StateOffline, nil
	}
}
