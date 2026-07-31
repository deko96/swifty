package agent

import (
	"context"
	"log/slog"
	"testing"

	"github.com/deko96/swifty/daemon/internal/supervisor"
)

type transition struct {
	id    string
	state supervisor.State
}

func newTestWatcher(manager *fakeManager) (*watcher, *[]transition) {
	var seen []transition
	w := newWatcher(manager, slog.New(slog.DiscardHandler), func(id string, state supervisor.State) {
		seen = append(seen, transition{id: id, state: state})
	})
	return w, &seen
}

func TestWatcherEmitsBaselineAndTransitions(t *testing.T) {
	manager := &fakeManager{state: supervisor.StateOffline}
	w, seen := newTestWatcher(manager)
	w.Track(testServerID)

	w.poll(context.Background())
	w.poll(context.Background())
	manager.mu.Lock()
	manager.state = supervisor.StateRunning
	manager.mu.Unlock()
	w.poll(context.Background())

	want := []transition{
		{testServerID, supervisor.StateOffline},
		{testServerID, supervisor.StateRunning},
	}
	if len(*seen) != len(want) {
		t.Fatalf("transitions = %v, want %v", *seen, want)
	}
	for i, tr := range want {
		if (*seen)[i] != tr {
			t.Fatalf("transition %d = %v, want %v", i, (*seen)[i], tr)
		}
	}
}

func TestWatcherSetServersDropsRemoved(t *testing.T) {
	manager := &fakeManager{state: supervisor.StateRunning}
	w, seen := newTestWatcher(manager)
	w.Track(testServerID)
	w.poll(context.Background())

	w.SetServers(nil)
	manager.mu.Lock()
	manager.state = supervisor.StateCrashed
	manager.mu.Unlock()
	w.poll(context.Background())

	if len(*seen) != 1 {
		t.Fatalf("transitions = %v, want only the baseline", *seen)
	}
	if len(w.ids()) != 0 {
		t.Fatalf("tracked = %v, want none", w.ids())
	}
}

func TestWatcherSetServersKeepsKnownState(t *testing.T) {
	manager := &fakeManager{state: supervisor.StateRunning}
	w, seen := newTestWatcher(manager)
	w.Track(testServerID)
	w.poll(context.Background())

	w.SetServers([]string{testServerID})
	w.poll(context.Background())

	if len(*seen) != 1 {
		t.Fatalf("transitions = %v, want no re-emission after sync", *seen)
	}
}
