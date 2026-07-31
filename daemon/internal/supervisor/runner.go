package supervisor

import (
	"context"
	"errors"
	"os/exec"
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
