package api

import (
	"context"
	"net/http"
	"path/filepath"

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

func (h *serverHandlers) create(w http.ResponseWriter, r *http.Request) {
	var body createServerBody
	if !decodeBody(w, r, &body) {
		return
	}
	if !serverIDPattern.MatchString(body.ID) {
		writeError(w, http.StatusBadRequest, errBadServerID)
		return
	}
	if err := h.manager.EnsureUser(r.Context(), h.spec(body.ID)); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
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
		writeError(w, http.StatusInternalServerError, err.Error())
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
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

	if body.Action == PowerStart || body.Action == PowerRestart {
		if message := validateStart(body); message != "" {
			writeError(w, http.StatusBadRequest, message)
			return
		}
	}

	var err error
	switch body.Action {
	case PowerStart:
		err = h.manager.Start(r.Context(), h.startSpec(id, body))
	case PowerRestart:
		// the unit may not be running; a fresh start must succeed regardless
		_ = h.manager.Stop(r.Context(), id)
		err = h.manager.Start(r.Context(), h.startSpec(id, body))
	case PowerStop:
		err = h.manager.Stop(r.Context(), id)
	case PowerKill:
		err = h.manager.Kill(r.Context(), id)
	default:
		writeError(w, http.StatusBadRequest, "action must be start, restart, stop, or kill")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *serverHandlers) startSpec(id string, body powerBody) supervisor.Spec {
	spec := h.spec(id)
	spec.Command = body.Command
	spec.Env = body.Env
	spec.Limits = body.limits()
	return spec
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
		writeError(w, http.StatusBadRequest, "install requires a script")
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
