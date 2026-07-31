// Package api exposes the daemon's HTTP API consumed by the panel.
package api

import "net/http"

// NewRouter serves /healthz publicly and everything under /v1/ only to
// callers presenting the panel token as a bearer token.
func NewRouter(token string, manager ServerManager, dataDir string) http.Handler {
	v1 := http.NewServeMux()
	v1.HandleFunc("GET /v1/system", handleSystem)
	servers := &serverHandlers{manager: manager, dataDir: dataDir}
	servers.register(v1)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealth)
	mux.Handle("/v1/", requireToken(token, v1))
	return mux
}
