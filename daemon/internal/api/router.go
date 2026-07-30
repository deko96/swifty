// Package api exposes the daemon's HTTP API consumed by the panel.
package api

import (
	"encoding/json"
	"net/http"

	"github.com/deko96/swifty/daemon/internal/version"
)

func NewRouter() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealth)
	return mux
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"version": version.String(),
	})
}
