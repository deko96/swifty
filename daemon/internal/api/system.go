package api

import (
	"net/http"
	"os"

	"github.com/deko96/swifty/daemon/internal/version"
)

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"version": version.String(),
	})
}

func handleSystem(w http.ResponseWriter, _ *http.Request) {
	hostname, _ := os.Hostname()
	writeJSON(w, http.StatusOK, map[string]string{
		"version":  version.String(),
		"hostname": hostname,
	})
}
