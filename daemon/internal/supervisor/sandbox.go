package supervisor

import (
	"fmt"
	"path/filepath"
)

const defaultPids = 256

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
//
// scripts/vps-verify-sandbox.sh parses this function body to prove every
// directive against a real kernel; its drift guard fails if the two diverge.
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
