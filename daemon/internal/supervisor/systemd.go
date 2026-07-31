package supervisor

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// Runner executes a command and reports its combined output and exit code.
// err is non-nil only when the command could not be run at all.
type Runner interface {
	Run(ctx context.Context, name string, args ...string) (output []byte, exitCode int, err error)
}

type execRunner struct{}

func (execRunner) Run(ctx context.Context, name string, args ...string) ([]byte, int, error) {
	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	if err == nil {
		return out, 0, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return out, exitErr.ExitCode(), nil
	}
	return out, -1, err
}

const (
	unitPrefix    = "swifty-"
	userPrefix    = "sv_"
	defaultPids   = 256
	useraddExists = 9
	userdelAbsent = 6
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

func UnitName(id string) string {
	return unitPrefix + id + ".service"
}

// Username derives the server's Unix user from its UUID, within the
// 32-character limit of useradd.
func Username(id string) string {
	clean := strings.ReplaceAll(id, "-", "")
	if len(clean) > 12 {
		clean = clean[:12]
	}
	return userPrefix + clean
}

func (s *Systemd) EnsureUser(ctx context.Context, spec Spec) error {
	out, code, err := s.runner.Run(ctx, "useradd",
		"--create-home",
		"--home-dir", spec.Directory,
		"--shell", "/usr/sbin/nologin",
		spec.UnixUser,
	)
	if err != nil {
		return err
	}
	if code != 0 && code != useraddExists {
		return fmt.Errorf("useradd %s: exit %d: %s", spec.UnixUser, code, out)
	}

	// 0750 keeps other server users out even without the mount sandbox.
	out, code, err = s.runner.Run(ctx, "chmod", "0750", spec.Directory)
	if err != nil {
		return err
	}
	if code != 0 {
		return fmt.Errorf("chmod %s: exit %d: %s", spec.Directory, code, out)
	}
	return nil
}

func (s *Systemd) RemoveUser(ctx context.Context, spec Spec) error {
	out, code, err := s.runner.Run(ctx, "userdel", "--remove", spec.UnixUser)
	if err != nil {
		return err
	}
	if code != 0 && code != userdelAbsent {
		return fmt.Errorf("userdel %s: exit %d: %s", spec.UnixUser, code, out)
	}
	return nil
}

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

func startArgs(spec Spec) []string {
	pids := spec.Limits.Pids
	if pids <= 0 {
		pids = defaultPids
	}
	args := []string{
		"--unit", UnitName(spec.ID),
		"--collect",
		"--uid", spec.UnixUser,
		"--gid", spec.UnixUser,
		"--working-directory", spec.Directory,
		"--property", fmt.Sprintf("MemoryMax=%dM", spec.Limits.MemoryMiB),
		"--property", fmt.Sprintf("CPUQuota=%d%%", spec.Limits.CPUPercent),
		"--property", fmt.Sprintf("TasksMax=%d", pids),
		"--property", "Restart=on-failure",
	}
	args = append(args, sandboxProps(spec)...)
	for key, value := range spec.Env {
		args = append(args, "--setenv", key+"="+value)
	}
	args = append(args, "--")
	return append(args, spec.Command...)
}

// sandboxProps confines the process to its own server directory: the OS is
// read-only, a tmpfs replaces the servers root so sibling directories do not
// exist inside the unit's mount namespace, and only the server's own
// directory is bound back writable. MemoryDenyWriteExecute is deliberately
// not set — JIT runtimes like the JVM need W^X exceptions.
func sandboxProps(spec Spec) []string {
	serversRoot := filepath.Dir(spec.Directory)
	return []string{
		"--property", "NoNewPrivileges=yes",
		"--property", "PrivateTmp=yes",
		"--property", "PrivateDevices=yes",
		"--property", "ProtectSystem=strict",
		"--property", "ProtectHome=yes",
		"--property", "ProtectKernelTunables=yes",
		"--property", "ProtectKernelModules=yes",
		"--property", "ProtectControlGroups=yes",
		"--property", "ProtectProc=invisible",
		"--property", "RestrictSUIDSGID=yes",
		"--property", "LockPersonality=yes",
		"--property", "TemporaryFileSystem=" + serversRoot,
		"--property", "BindPaths=" + spec.Directory,
		"--property", "ReadWritePaths=" + spec.Directory,
	}
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

// RunInstall executes an install script inside a transient unit as the
// server's user, waiting for completion and returning combined output.
func (s *Systemd) RunInstall(ctx context.Context, spec Spec, script string) ([]byte, error) {
	args := []string{
		"--wait", "--pipe", "--collect",
		"--unit", unitPrefix + spec.ID + "-install.service",
		"--uid", spec.UnixUser,
		"--gid", spec.UnixUser,
		"--working-directory", spec.Directory,
	}
	args = append(args, sandboxProps(spec)...)
	args = append(args, "--setenv", "SERVER_DIR="+spec.Directory)
	for key, value := range spec.Env {
		args = append(args, "--setenv", key+"="+value)
	}
	args = append(args, "--", "/bin/bash", "-ec", script)
	out, code, err := s.runner.Run(ctx, "systemd-run", args...)
	if err != nil {
		return out, err
	}
	if code != 0 {
		return out, fmt.Errorf("install %s: exit %d", spec.ID, code)
	}
	return out, nil
}
