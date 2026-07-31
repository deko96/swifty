package api

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"regexp"

	"github.com/deko96/swifty/daemon/internal/supervisor"
)

// ServerManager is the slice of the supervisor the HTTP API drives.
type ServerManager interface {
	EnsureUser(ctx context.Context, spec supervisor.Spec) error
	RemoveUser(ctx context.Context, spec supervisor.Spec) error
	Start(ctx context.Context, spec supervisor.Spec) error
	Stop(ctx context.Context, id string) error
	Kill(ctx context.Context, id string) error
	State(ctx context.Context, id string) (supervisor.State, error)
	RunInstall(ctx context.Context, spec supervisor.Spec, script string) ([]byte, error)
}

// Server IDs become unit names and filesystem paths, so only canonical
// lowercase UUIDs are accepted.
var serverIDPattern = regexp.MustCompile(
	`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type serverHandlers struct {
	manager ServerManager
	dataDir string
}

func (h *serverHandlers) register(mux *http.ServeMux) {
	mux.HandleFunc("POST /v1/servers", h.create)
	mux.HandleFunc("GET /v1/servers/{id}", h.get)
	mux.HandleFunc("DELETE /v1/servers/{id}", h.delete)
	mux.HandleFunc("POST /v1/servers/{id}/power", h.power)
	mux.HandleFunc("POST /v1/servers/{id}/install", h.install)
}

func (h *serverHandlers) spec(id string) supervisor.Spec {
	return supervisor.Spec{
		ID:        id,
		UnixUser:  supervisor.Username(id),
		Directory: filepath.Join(h.dataDir, id),
	}
}

func pathID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := r.PathValue("id")
	if !serverIDPattern.MatchString(id) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id must be a lowercase UUID"})
		return "", false
	}
	return id, true
}

func decodeBody(w http.ResponseWriter, r *http.Request, into any) bool {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(into); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body: " + err.Error()})
		return false
	}
	return true
}

type limitsBody struct {
	CPUPercent int   `json:"cpuPercent"`
	MemoryMiB  int64 `json:"memoryMiB"`
	DiskMiB    int64 `json:"diskMiB"`
	Pids       int   `json:"pids"`
}

type createServerBody struct {
	ID string `json:"id"`
}

func (h *serverHandlers) create(w http.ResponseWriter, r *http.Request) {
	var body createServerBody
	if !decodeBody(w, r, &body) {
		return
	}
	if !serverIDPattern.MatchString(body.ID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id must be a lowercase UUID"})
		return
	}
	if err := h.manager.EnsureUser(r.Context(), h.spec(body.ID)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": body.ID})
}

func (h *serverHandlers) get(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	state, err := h.manager.State(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "state": string(state)})
}

func (h *serverHandlers) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	// the unit may not exist; removal must succeed regardless
	_ = h.manager.Kill(r.Context(), id)
	if err := h.manager.RemoveUser(r.Context(), h.spec(id)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type powerBody struct {
	Action  string            `json:"action"`
	Command []string          `json:"command"`
	Env     map[string]string `json:"env"`
	Limits  limitsBody        `json:"limits"`
}

func (h *serverHandlers) power(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body powerBody
	if !decodeBody(w, r, &body) {
		return
	}

	if body.Action == "start" || body.Action == "restart" {
		if message := validateStart(body); message != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": message})
			return
		}
	}

	var err error
	switch body.Action {
	case "start":
		err = h.manager.Start(r.Context(), h.startSpec(id, body))
	case "restart":
		// the unit may not be running; a fresh start must succeed regardless
		_ = h.manager.Stop(r.Context(), id)
		err = h.manager.Start(r.Context(), h.startSpec(id, body))
	case "stop":
		err = h.manager.Stop(r.Context(), id)
	case "kill":
		err = h.manager.Kill(r.Context(), id)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "action must be start, restart, stop, or kill"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

func (h *serverHandlers) startSpec(id string, body powerBody) supervisor.Spec {
	spec := h.spec(id)
	spec.Command = body.Command
	spec.Env = body.Env
	spec.Limits = supervisor.Limits{
		CPUPercent: body.Limits.CPUPercent,
		MemoryMiB:  body.Limits.MemoryMiB,
		DiskMiB:    body.Limits.DiskMiB,
		Pids:       body.Limits.Pids,
	}
	return spec
}

type installBody struct {
	Script string            `json:"script"`
	Env    map[string]string `json:"env"`
}

// install runs the template's install script to completion and returns its
// combined output. Long-running by design: the panel calls it from a queue
// worker, and the daemon's HTTP server has no write timeout.
func (h *serverHandlers) install(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body installBody
	if !decodeBody(w, r, &body) {
		return
	}
	if body.Script == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "install requires a script"})
		return
	}
	spec := h.spec(id)
	spec.Env = body.Env
	output, err := h.manager.RunInstall(r.Context(), spec, body.Script)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":  err.Error(),
			"output": string(output),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"output": string(output)})
}
