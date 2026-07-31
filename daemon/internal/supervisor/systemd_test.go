package supervisor

import (
	"context"
	"slices"
	"strings"
	"testing"
)

type fakeRunner struct {
	calls  [][]string
	output string
	code   int
	codes  []int
}

func (f *fakeRunner) Run(_ context.Context, name string, args ...string) ([]byte, int, error) {
	f.calls = append(f.calls, append([]string{name}, args...))
	code := f.code
	if len(f.codes) > 0 {
		code = f.codes[0]
		f.codes = f.codes[1:]
	}
	return []byte(f.output), code, nil
}

func testSpec() Spec {
	return Spec{
		ID:        "0e6b7a1c-9f6e-4c56-8f4a-2d1b3c4d5e6f",
		UnixUser:  Username("0e6b7a1c-9f6e-4c56-8f4a-2d1b3c4d5e6f"),
		Directory: "/opt/swifty/servers/0e6b7a1c",
		Command:   []string{"./hlds_run", "-game", "cstrike"},
		Env:       map[string]string{"MAX_PLAYERS": "24"},
		Limits:    Limits{CPUPercent: 200, MemoryMiB: 2048, DiskMiB: 20480},
	}
}

func TestUsername(t *testing.T) {
	name := Username("0e6b7a1c-9f6e-4c56-8f4a-2d1b3c4d5e6f")
	if name != "sv_0e6b7a1c9f6e" {
		t.Errorf("Username = %q", name)
	}
	if len(name) > 32 {
		t.Errorf("username exceeds Linux limit: %q", name)
	}
}

func TestStartArgsEnforceIsolationAndLimits(t *testing.T) {
	args := startArgs(testSpec())
	joined := strings.Join(args, " ")

	for _, want := range []string{
		"--unit swifty-0e6b7a1c-9f6e-4c56-8f4a-2d1b3c4d5e6f.service",
		"--uid sv_0e6b7a1c9f6e",
		"--property MemoryMax=2048M",
		"--property CPUQuota=200%",
		"--property TasksMax=256",
		"--property NoNewPrivileges=yes",
		"--setenv MAX_PLAYERS=24",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("startArgs missing %q in %q", want, joined)
		}
	}

	sep := slices.Index(args, "--")
	if sep == -1 || !slices.Equal(args[sep+1:], []string{"./hlds_run", "-game", "cstrike"}) {
		t.Errorf("command not passed after separator: %v", args)
	}
}

func TestSandboxHidesOtherServers(t *testing.T) {
	spec := testSpec()
	joined := strings.Join(sandboxProps(spec), " ")

	for _, want := range []string{
		"ProtectSystem=strict",
		"ProtectHome=yes",
		"ProtectProc=invisible",
		"PrivateDevices=yes",
		"RestrictSUIDSGID=yes",
		"TemporaryFileSystem=/opt/swifty/servers",
		"BindPaths=" + spec.Directory,
		"ReadWritePaths=" + spec.Directory,
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("sandboxProps missing %q in %q", want, joined)
		}
	}

	if strings.Contains(joined, "MemoryDenyWriteExecute") {
		t.Error("MemoryDenyWriteExecute must stay off for JIT runtimes")
	}

	start := strings.Join(startArgs(spec), " ")
	if !strings.Contains(start, "TemporaryFileSystem=/opt/swifty/servers") {
		t.Error("startArgs must include the mount sandbox")
	}
}

func TestEnsureUserToleratesExisting(t *testing.T) {
	runner := &fakeRunner{codes: []int{useraddExists, 0}}
	s := &Systemd{runner: runner}
	if err := s.EnsureUser(context.Background(), testSpec()); err != nil {
		t.Fatalf("EnsureUser: %v", err)
	}
	if runner.calls[0][0] != "useradd" {
		t.Errorf("expected useradd, got %v", runner.calls[0])
	}
	if !slices.Equal(runner.calls[1], []string{"chmod", "0750", testSpec().Directory}) {
		t.Errorf("expected chmod 0750 after useradd, got %v", runner.calls[1])
	}

	runner.codes = []int{1}
	if err := s.EnsureUser(context.Background(), testSpec()); err == nil {
		t.Fatal("expected error for real useradd failure")
	}
}

func TestRemoveUserToleratesAbsent(t *testing.T) {
	runner := &fakeRunner{code: userdelAbsent}
	s := &Systemd{runner: runner}
	if err := s.RemoveUser(context.Background(), testSpec()); err != nil {
		t.Fatalf("RemoveUser: %v", err)
	}
}

func TestStateMapping(t *testing.T) {
	cases := map[string]State{
		"active\nrunning":     StateRunning,
		"activating\nstart":   StateStarting,
		"deactivating\nstop":  StateStopping,
		"failed\nfailed":      StateCrashed,
		"inactive\ndead":      StateOffline,
		"not-found\ninactive": StateOffline,
	}
	for output, want := range cases {
		runner := &fakeRunner{output: output}
		s := &Systemd{runner: runner}
		got, err := s.State(context.Background(), "id")
		if err != nil {
			t.Fatalf("State(%q): %v", output, err)
		}
		if got != want {
			t.Errorf("State(%q) = %q, want %q", output, got, want)
		}
	}
}

func TestStopAndKillTargetTheUnit(t *testing.T) {
	runner := &fakeRunner{}
	s := &Systemd{runner: runner}
	spec := testSpec()

	if err := s.Stop(context.Background(), spec.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.Kill(context.Background(), spec.ID); err != nil {
		t.Fatal(err)
	}

	if !slices.Equal(runner.calls[0], []string{"systemctl", "stop", UnitName(spec.ID)}) {
		t.Errorf("stop call = %v", runner.calls[0])
	}
	if !slices.Equal(runner.calls[1], []string{"systemctl", "kill", "--signal=SIGKILL", UnitName(spec.ID)}) {
		t.Errorf("kill call = %v", runner.calls[1])
	}
}

func TestRunInstallWaitsAndRunsAsUser(t *testing.T) {
	runner := &fakeRunner{output: "steamcmd done"}
	s := &Systemd{runner: runner}
	spec := testSpec()

	out, err := s.RunInstall(context.Background(), spec, "steamcmd +quit")
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != "steamcmd done" {
		t.Errorf("output = %q", out)
	}

	call := strings.Join(runner.calls[0], " ")
	for _, want := range []string{"--wait", "--pipe", "--uid " + spec.UnixUser, "SERVER_DIR=" + spec.Directory, "-ec steamcmd +quit"} {
		if !strings.Contains(call, want) {
			t.Errorf("install call missing %q: %s", want, call)
		}
	}

	runner.code = 1
	if _, err := s.RunInstall(context.Background(), spec, "exit 1"); err == nil {
		t.Fatal("expected error for failing install")
	}
}
