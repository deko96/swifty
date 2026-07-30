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

	"github.com/deko96/swifty/daemon/internal/api"
	"github.com/deko96/swifty/daemon/internal/version"
)

func main() {
	listenAddr := flag.String("listen", "127.0.0.1:8443", "address the daemon API listens on")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version.String())
		return
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(logger, *listenAddr); err != nil {
		logger.Error("daemon exited with error", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger, listenAddr string) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	server := &http.Server{
		Addr:              listenAddr,
		Handler:           api.NewRouter(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("daemon API listening", "addr", listenAddr, "version", version.String())
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
