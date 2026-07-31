package api

import (
	"encoding/json"
	"net/http"
	"regexp"

	"github.com/deko96/swifty/daemon/internal/agent"
	"github.com/deko96/swifty/daemon/internal/supervisor"
)

// Server IDs become unit names and filesystem paths, so only canonical
// lowercase UUIDs are accepted.
var serverIDPattern = regexp.MustCompile(
	`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

const errBadServerID = "id must be a lowercase UUID"

type limitsBody struct {
	CPUPercent int   `json:"cpuPercent"`
	MemoryMiB  int64 `json:"memoryMiB"`
	DiskMiB    int64 `json:"diskMiB"`
	Pids       int   `json:"pids"`
}

type createServerBody struct {
	ID string `json:"id"`
}

type powerBody struct {
	Action  agent.PowerAction `json:"action"`
	Command []string          `json:"command"`
	Env     map[string]string `json:"env"`
	Limits  limitsBody        `json:"limits"`
}

type installBody struct {
	Script string            `json:"script"`
	Env    map[string]string `json:"env"`
}

func (b powerBody) limits() supervisor.Limits {
	return supervisor.Limits{
		CPUPercent: b.Limits.CPUPercent,
		MemoryMiB:  b.Limits.MemoryMiB,
		DiskMiB:    b.Limits.DiskMiB,
		Pids:       b.Limits.Pids,
	}
}

func validateStart(body powerBody) string {
	if len(body.Command) == 0 || body.Command[0] == "" {
		return "start requires a command"
	}
	if body.Limits.MemoryMiB <= 0 || body.Limits.CPUPercent <= 0 {
		return "start requires positive memoryMiB and cpuPercent limits"
	}
	return ""
}

func pathID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := r.PathValue("id")
	if !serverIDPattern.MatchString(id) {
		writeError(w, http.StatusBadRequest, errBadServerID)
		return "", false
	}
	return id, true
}

func decodeBody(w http.ResponseWriter, r *http.Request, into any) bool {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(into); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return false
	}
	return true
}
