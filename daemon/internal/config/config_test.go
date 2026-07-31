package config

import (
	"os"
	"path/filepath"
	"testing"
)

func write(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "swiftyd.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadAppliesDefaults(t *testing.T) {
	cfg, err := Load(write(t, `{"token":"node_abc"}`))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Listen != "0.0.0.0:8443" {
		t.Errorf("Listen = %q", cfg.Listen)
	}
	if cfg.DataDir != "/opt/swifty/servers" {
		t.Errorf("DataDir = %q", cfg.DataDir)
	}
	if cfg.Token != "node_abc" {
		t.Errorf("Token = %q", cfg.Token)
	}
}

func TestLoadRejectsMissingToken(t *testing.T) {
	if _, err := Load(write(t, `{"listen":"127.0.0.1:9000"}`)); err == nil {
		t.Fatal("expected error for missing token")
	}
}

func TestLoadRejectsMissingFile(t *testing.T) {
	if _, err := Load(filepath.Join(t.TempDir(), "absent.json")); err == nil {
		t.Fatal("expected error for missing file")
	}
}
