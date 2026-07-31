package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/deko96/swifty/daemon/internal/supervisor"
)

const (
	testServerID  = "b6f7f0d2-4c1a-4a2e-9b83-2f6e4b8a91c5"
	testCommandID = "018f2c3a-9d41-7c22-b7e4-52a09a1de3fd"
)

type fakeManager struct {
	mu      sync.Mutex
	calls   []string
	specs   []supervisor.Spec
	state   supervisor.State
	output  []byte
	failure error
}

func (m *fakeManager) record(call string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = append(m.calls, call)
}

func (m *fakeManager) Start(_ context.Context, spec supervisor.Spec) error {
	m.record("start " + spec.ID)
	m.mu.Lock()
	defer m.mu.Unlock()
	m.specs = append(m.specs, spec)
	return m.failure
}

func (m *fakeManager) Stop(_ context.Context, id string) error {
	m.record("stop " + id)
	return m.failure
}

func (m *fakeManager) Kill(_ context.Context, id string) error {
	m.record("kill " + id)
	return m.failure
}

func (m *fakeManager) State(context.Context, string) (supervisor.State, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state, nil
}

func (m *fakeManager) RunInstall(_ context.Context, spec supervisor.Spec, _ string) ([]byte, error) {
	m.record("install " + spec.ID)
	return m.output, m.failure
}

func (m *fakeManager) recorded() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]string(nil), m.calls...)
}

func newTestClient(manager ServerManager) *Client {
	return NewClient(Options{
		PanelURL:      "http://panel.invalid",
		Token:         "node-token",
		DataDir:       "/opt/swifty/servers",
		DaemonVersion: "test",
		Manager:       manager,
		Logger:        slog.New(slog.DiscardHandler),
	})
}

func command(t *testing.T, event string, data any) []byte {
	t.Helper()
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal command data: %v", err)
	}
	envelope, err := json.Marshal(Envelope{Event: event, Data: raw})
	if err != nil {
		t.Fatalf("marshal command envelope: %v", err)
	}
	return envelope
}

func awaitResult(t *testing.T, c *Client) ResultEvent {
	t.Helper()
	select {
	case envelope := <-c.outbound:
		if envelope.Event != EventResult {
			t.Fatalf("event = %q, want %q", envelope.Event, EventResult)
		}
		var result ResultEvent
		if err := json.Unmarshal(envelope.Data, &result); err != nil {
			t.Fatalf("decode result: %v", err)
		}
		if result.CommandID != testCommandID {
			t.Fatalf("commandId = %q, want %q", result.CommandID, testCommandID)
		}
		return result
	case <-time.After(2 * time.Second):
		t.Fatal("no result event")
		return ResultEvent{}
	}
}

func testMeta() Meta {
	return Meta{V: ProtocolVersion, ID: testCommandID}
}

func TestDispatchPowerStop(t *testing.T) {
	manager := &fakeManager{}
	c := newTestClient(manager)

	c.dispatch(command(t, CommandPower, PowerCommand{
		Meta: testMeta(), ServerID: testServerID, Action: PowerStop,
	}))

	result := awaitResult(t, c)
	if !result.OK {
		t.Fatalf("result not ok: %s", result.Error)
	}
	calls := manager.recorded()
	if len(calls) != 1 || calls[0] != "stop "+testServerID {
		t.Fatalf("calls = %v", calls)
	}
}

func TestDispatchPowerStartBuildsSpec(t *testing.T) {
	manager := &fakeManager{}
	c := newTestClient(manager)

	c.dispatch(command(t, CommandPower, PowerCommand{
		Meta:     testMeta(),
		ServerID: testServerID,
		Action:   PowerStart,
		Command:  []string{"./cs2", "-dedicated"},
		Env:      map[string]string{"MAX_PLAYERS": "20"},
		Limits:   &Limits{CPUPercent: 200, MemoryMiB: 4096, DiskMiB: 40960, Pids: 256},
	}))

	if result := awaitResult(t, c); !result.OK {
		t.Fatalf("result not ok: %s", result.Error)
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if len(manager.specs) != 1 {
		t.Fatalf("specs = %d, want 1", len(manager.specs))
	}
	spec := manager.specs[0]
	if spec.UnixUser != supervisor.Username(testServerID) {
		t.Fatalf("unix user = %q", spec.UnixUser)
	}
	if spec.Directory != "/opt/swifty/servers/"+testServerID {
		t.Fatalf("directory = %q", spec.Directory)
	}
	if spec.Limits.MemoryMiB != 4096 {
		t.Fatalf("memory = %d", spec.Limits.MemoryMiB)
	}
}

func TestDispatchPowerStartValidation(t *testing.T) {
	manager := &fakeManager{}
	c := newTestClient(manager)

	c.dispatch(command(t, CommandPower, PowerCommand{
		Meta: testMeta(), ServerID: testServerID, Action: PowerStart,
	}))

	result := awaitResult(t, c)
	if result.OK {
		t.Fatal("start without command must fail")
	}
	if len(manager.recorded()) != 0 {
		t.Fatalf("manager called: %v", manager.recorded())
	}
}

func TestDispatchRejectsBadServerID(t *testing.T) {
	manager := &fakeManager{}
	c := newTestClient(manager)

	c.dispatch(command(t, CommandPower, PowerCommand{
		Meta: testMeta(), ServerID: "../../etc", Action: PowerStop,
	}))

	result := awaitResult(t, c)
	if result.OK {
		t.Fatal("bad server id must fail")
	}
	if len(manager.recorded()) != 0 {
		t.Fatalf("manager called: %v", manager.recorded())
	}
}

func TestDispatchInstallReturnsOutput(t *testing.T) {
	manager := &fakeManager{output: []byte("steamcmd done")}
	c := newTestClient(manager)

	c.dispatch(command(t, CommandInstall, InstallCommand{
		Meta: testMeta(), ServerID: testServerID, Script: "steamcmd +quit",
	}))

	result := awaitResult(t, c)
	if !result.OK || result.Output != "steamcmd done" {
		t.Fatalf("result = %+v", result)
	}
}

func TestDispatchSyncTracksServers(t *testing.T) {
	manager := &fakeManager{}
	c := newTestClient(manager)

	c.dispatch(command(t, CommandSync, SyncCommand{
		Meta: testMeta(),
		Servers: []DesiredServer{
			{ServerID: testServerID, Autostart: true},
		},
	}))

	if result := awaitResult(t, c); !result.OK {
		t.Fatalf("result not ok: %s", result.Error)
	}
	ids := c.watcher.ids()
	if len(ids) != 1 || ids[0] != testServerID {
		t.Fatalf("tracked = %v", ids)
	}
}

func TestDispatchIgnoresUnknownEvent(t *testing.T) {
	c := newTestClient(&fakeManager{})

	c.dispatch([]byte(`{"event":"totally.new","data":{"v":1,"id":"x"}}`))

	select {
	case envelope := <-c.outbound:
		t.Fatalf("unexpected outbound %q", envelope.Event)
	case <-time.After(50 * time.Millisecond):
	}
}
