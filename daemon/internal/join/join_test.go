package join

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunWritesConfigWithPinnedPanelURL(t *testing.T) {
	var received registerRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != registerPath {
			t.Errorf("path = %q, want %q", r.URL.Path, registerPath)
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Errorf("decode request: %v", err)
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{
			"listen": "0.0.0.0:8443",
			"token": "node_secret",
			"dataDir": "/opt/swifty/servers",
			"panelUrl": "https://wrong.example.com"
		}`))
	}))
	defer server.Close()

	configPath := filepath.Join(t.TempDir(), "etc", "swiftyd.json")
	err := Run(Options{PanelURL: server.URL + "/", Token: "join_abc", ConfigPath: configPath})
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	if received.Token != "join_abc" {
		t.Fatalf("register token = %q", received.Token)
	}
	if received.Hostname == "" {
		t.Fatal("register hostname is empty")
	}

	info, err := os.Stat(configPath)
	if err != nil {
		t.Fatalf("stat config: %v", err)
	}
	if info.Mode().Perm() != configFileMode {
		t.Fatalf("config mode = %v, want %v", info.Mode().Perm(), os.FileMode(configFileMode))
	}

	raw, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	var config map[string]any
	if err := json.Unmarshal(raw, &config); err != nil {
		t.Fatalf("parse config: %v", err)
	}
	if config["token"] != "node_secret" {
		t.Fatalf("config token = %v", config["token"])
	}
	// the daemon pins panelUrl to the address it actually reached
	if config["panelUrl"] != server.URL {
		t.Fatalf("config panelUrl = %v, want %v", config["panelUrl"], server.URL)
	}
}

func TestRunSurfacesPanelRejection(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"code":"nodes.join_token_invalid"}`))
	}))
	defer server.Close()

	err := Run(Options{
		PanelURL:   server.URL,
		Token:      "join_expired",
		ConfigPath: filepath.Join(t.TempDir(), "swiftyd.json"),
	})
	if err == nil || !strings.Contains(err.Error(), "join_token_invalid") {
		t.Fatalf("err = %v, want join_token_invalid rejection", err)
	}
}

func TestRunRequiresPanelAndToken(t *testing.T) {
	if err := Run(Options{}); err == nil {
		t.Fatal("expected an error without --panel and --token")
	}
}
