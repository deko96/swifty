// Package config loads the daemon configuration written by the panel's
// node config endpoint.
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

const (
	DefaultPath    = "/etc/swifty/swiftyd.json"
	DefaultListen  = "0.0.0.0:8443"
	DefaultDataDir = "/opt/swifty/servers"
)

type Config struct {
	// Listen is the host:port the daemon API binds.
	Listen string `json:"listen"`
	// Token authenticates the panel; requests without it are rejected.
	Token string `json:"token"`
	// DataDir is the directory game servers live in.
	DataDir string `json:"dataDir"`
	// PanelURL is the panel's base URL; when set, the daemon dials the
	// panel's agent channel and keeps it connected. Empty disables the
	// channel (HTTP-only mode).
	PanelURL string `json:"panelUrl"`
}

func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	cfg := &Config{
		Listen:  DefaultListen,
		DataDir: DefaultDataDir,
	}
	if err := json.Unmarshal(raw, cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	if cfg.Token == "" {
		return nil, errors.New("config is missing the panel token")
	}
	return cfg, nil
}
