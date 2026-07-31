package supervisor

import (
	"context"
	"fmt"
)

const (
	useraddExists = 9
	userdelAbsent = 6

	// 0750 keeps other server users out even without the mount sandbox.
	serverDirMode = "0750"
)

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

	out, code, err = s.runner.Run(ctx, "chmod", serverDirMode, spec.Directory)
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
