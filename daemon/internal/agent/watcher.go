package agent

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/deko96/swifty/daemon/internal/supervisor"
)

// watcher polls the supervisor for the state of every tracked server and
// emits an event on each transition. The tracked set comes from sync
// commands and grows as power commands touch new servers; the first
// observation of a server always emits so the panel gets a baseline.
type watcher struct {
	manager  ServerManager
	logger   *slog.Logger
	emit     func(id string, state supervisor.State)
	interval time.Duration

	mu     sync.Mutex
	states map[string]supervisor.State
}

func newWatcher(manager ServerManager, logger *slog.Logger, emit func(string, supervisor.State)) *watcher {
	return &watcher{
		manager:  manager,
		logger:   logger,
		emit:     emit,
		interval: watchInterval,
		states:   make(map[string]supervisor.State),
	}
}

func (w *watcher) Track(id string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if _, known := w.states[id]; !known {
		w.states[id] = ""
	}
}

func (w *watcher) SetServers(ids []string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	next := make(map[string]supervisor.State, len(ids))
	for _, id := range ids {
		next[id] = w.states[id]
	}
	w.states = next
}

func (w *watcher) run(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.poll(ctx)
		}
	}
}

func (w *watcher) poll(ctx context.Context) {
	for _, id := range w.ids() {
		state, err := w.manager.State(ctx, id)
		if err != nil {
			w.logger.Warn("state poll failed", "server", id, "error", err)
			continue
		}
		if w.record(id, state) {
			w.emit(id, state)
		}
	}
}

func (w *watcher) ids() []string {
	w.mu.Lock()
	defer w.mu.Unlock()
	ids := make([]string, 0, len(w.states))
	for id := range w.states {
		ids = append(ids, id)
	}
	return ids
}

// record stores the observation and reports whether it is a transition. A
// server removed by SetServers mid-poll stays removed.
func (w *watcher) record(id string, state supervisor.State) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	last, tracked := w.states[id]
	if !tracked || last == state {
		return false
	}
	w.states[id] = state
	return true
}
