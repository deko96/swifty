// Command swiftyd is the Swifty node daemon: it supervises game server
// processes on a single machine and exposes an API consumed by the panel.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/deko96/swifty/daemon/internal/agent"
	"github.com/deko96/swifty/daemon/internal/api"
	"github.com/deko96/swifty/daemon/internal/config"
	"github.com/deko96/swifty/daemon/internal/join"
	"github.com/deko96/swifty/daemon/internal/supervisor"
	"github.com/deko96/swifty/daemon/internal/version"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	if len(os.Args) > 1 && os.Args[1] == "join" {
		if err := runJoin(os.Args[2:]); err != nil {
			logger.Error("join failed", "error", err)
			os.Exit(1)
		}
		fmt.Println("node registered — configuration written")
		return
	}

	configPath := flag.String("config", config.DefaultPath, "path to the daemon configuration file")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version.String())
		return
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	if err := run(logger, cfg); err != nil {
		logger.Error("daemon exited with error", "error", err)
		os.Exit(1)
	}
}

func runJoin(args []string) error {
	flags := flag.NewFlagSet("join", flag.ExitOnError)
	panelURL := flags.String("panel", "", "panel base URL, e.g. https://panel.example.com")
	token := flags.String("token", "", "one-time join token issued by the panel")
	configPath := flags.String("config", config.DefaultPath, "where to write the daemon configuration")
	insecureTLS := flags.Bool("insecure-tls", false, "accept the panel's self-signed certificate")
	if err := flags.Parse(args); err != nil {
		return err
	}
	return join.Run(join.Options{
		PanelURL:    *panelURL,
		Token:       *token,
		ConfigPath:  *configPath,
		InsecureTLS: *insecureTLS,
	})
}

func run(logger *slog.Logger, cfg *config.Config) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	manager := supervisor.NewSystemd()
	server := &http.Server{
		Addr:              cfg.Listen,
		Handler:           api.NewRouter(cfg.Token, manager, cfg.DataDir),
		ReadHeaderTimeout: 10 * time.Second,
	}

	if cfg.PanelURL != "" {
		client := agent.NewClient(agent.Options{
			PanelURL:      cfg.PanelURL,
			Token:         cfg.Token,
			DataDir:       cfg.DataDir,
			DaemonVersion: version.String(),
			Manager:       manager,
			Logger:        logger,
		})
		go func() {
			if err := client.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
				logger.Error("agent channel stopped", "error", err)
			}
		}()
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("daemon API listening", "addr", cfg.Listen, "version", version.String())
		errCh <- server.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		logger.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}
