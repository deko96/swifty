package agent

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

const (
	cpuinfoPath = "/proc/cpuinfo"
	meminfoPath = "/proc/meminfo"
	kiBPerMiB   = 1024
)

// collectInventory describes this machine for the hello event. The /proc
// readers return zero values on platforms without procfs; the daemon only
// targets Linux, but the graceful fallback keeps development on other
// systems working.
func collectInventory(dataDir string) HardwareInventory {
	hostname, _ := os.Hostname()
	return HardwareInventory{
		Hostname:  hostname,
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		CPUModel:  cpuModel(),
		CPUCores:  runtime.NumCPU(),
		MemoryMiB: memoryTotalMiB(),
		DiskMiB:   diskTotalMiB(dataDir),
	}
}

func cpuModel() string {
	raw, err := os.ReadFile(cpuinfoPath)
	if err != nil {
		return ""
	}
	for line := range strings.Lines(string(raw)) {
		key, value, found := strings.Cut(line, ":")
		if found && strings.TrimSpace(key) == "model name" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func memoryTotalMiB() int64 {
	raw, err := os.ReadFile(meminfoPath)
	if err != nil {
		return 0
	}
	for line := range strings.Lines(string(raw)) {
		key, value, found := strings.Cut(line, ":")
		if !found || strings.TrimSpace(key) != "MemTotal" {
			continue
		}
		fields := strings.Fields(value)
		if len(fields) == 0 {
			return 0
		}
		kiB, err := strconv.ParseInt(fields[0], 10, 64)
		if err != nil {
			return 0
		}
		return kiB / kiBPerMiB
	}
	return 0
}

func diskTotalMiB(dataDir string) int64 {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(dataDir, &stat); err != nil {
		return 0
	}
	return int64(stat.Bsize) * int64(stat.Blocks) / (kiBPerMiB * kiBPerMiB)
}
