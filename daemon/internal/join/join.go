// Package join implements `swiftyd join`: it exchanges a one-time join
// token for this node's daemon configuration and writes the config file.
package join

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	registerPath   = "/api/v1/nodes/register"
	requestTimeout = 30 * time.Second
	configFileMode = 0o600
	configDirMode  = 0o755
)

type Options struct {
	PanelURL    string
	Token       string
	ConfigPath  string
	InsecureTLS bool
}

type registerRequest struct {
	Token    string `json:"token"`
	Hostname string `json:"hostname"`
}

// Run registers this machine with the panel and writes the returned
// configuration, with panelUrl pinned to the address we actually reached
// the panel on.
func Run(opts Options) error {
	if opts.PanelURL == "" || opts.Token == "" {
		return errors.New("join requires --panel and --token")
	}

	hostname, err := os.Hostname()
	if err != nil {
		return fmt.Errorf("resolve hostname: %w", err)
	}

	config, err := register(opts, hostname)
	if err != nil {
		return err
	}
	config["panelUrl"] = strings.TrimRight(opts.PanelURL, "/")

	raw, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(opts.ConfigPath), configDirMode); err != nil {
		return fmt.Errorf("create config directory: %w", err)
	}
	if err := os.WriteFile(opts.ConfigPath, raw, configFileMode); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	return nil
}

func register(opts Options, hostname string) (map[string]any, error) {
	body, err := json.Marshal(registerRequest{Token: opts.Token, Hostname: hostname})
	if err != nil {
		return nil, fmt.Errorf("encode register request: %w", err)
	}

	client := &http.Client{Timeout: requestTimeout}
	if opts.InsecureTLS {
		client.Transport = &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
	}

	url := strings.TrimRight(opts.PanelURL, "/") + registerPath
	response, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("reach panel: %w", err)
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, fmt.Errorf("read panel response: %w", err)
	}
	if response.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("panel rejected the join (%s): %s",
			response.Status, strings.TrimSpace(string(payload)))
	}

	var config map[string]any
	if err := json.Unmarshal(payload, &config); err != nil {
		return nil, fmt.Errorf("parse panel response: %w", err)
	}
	return config, nil
}
