package supervisor

import (
	"context"
	"fmt"
)

const installUnitSuffix = "-install.service"

// RunInstall executes an install script inside a transient unit as the
// server's user, waiting for completion and returning combined output.
func (s *Systemd) RunInstall(ctx context.Context, spec Spec, script string) ([]byte, error) {
	args := []string{
		"--wait", "--pipe", "--collect",
		"--unit", unitPrefix + spec.ID + installUnitSuffix,
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
