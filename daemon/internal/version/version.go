// Package version exposes the daemon's build version.
package version

// Set via -ldflags "-X github.com/deko96/swifty/daemon/internal/version.version=v1.2.3" at build time.
var version = "dev"

func String() string {
	return version
}
