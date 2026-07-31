package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// fakePanel accepts one agent connection, asserts the handshake, sends a
// power command, and reports what it saw.
type fakePanel struct {
	t       *testing.T
	hello   chan HelloEvent
	results chan ResultEvent
}

func newFakePanel(t *testing.T) *fakePanel {
	return &fakePanel{
		t:       t,
		hello:   make(chan HelloEvent, 1),
		results: make(chan ResultEvent, 1),
	}
}

func (p *fakePanel) handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer node-token" {
			http.Error(w, "bad token", http.StatusUnauthorized)
			return
		}
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()
		ctx := r.Context()

		var hello HelloEvent
		if !p.read(ctx, conn, EventHello, &hello) {
			return
		}
		p.hello <- hello

		command, err := json.Marshal(PowerCommand{
			Meta:     Meta{V: ProtocolVersion, ID: testCommandID},
			ServerID: testServerID,
			Action:   PowerStop,
		})
		if err != nil {
			p.t.Errorf("marshal command: %v", err)
			return
		}
		envelope, err := json.Marshal(Envelope{Event: CommandPower, Data: command})
		if err != nil {
			p.t.Errorf("marshal envelope: %v", err)
			return
		}
		if err := conn.Write(ctx, websocket.MessageText, envelope); err != nil {
			p.t.Errorf("write command: %v", err)
			return
		}

		var result ResultEvent
		if !p.read(ctx, conn, EventResult, &result) {
			return
		}
		p.results <- result
	}
}

func (p *fakePanel) read(ctx context.Context, conn *websocket.Conn, event string, into any) bool {
	_, raw, err := conn.Read(ctx)
	if err != nil {
		p.t.Errorf("read %s: %v", event, err)
		return false
	}
	var envelope Envelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		p.t.Errorf("decode envelope: %v", err)
		return false
	}
	if envelope.Event != event {
		p.t.Errorf("event = %q, want %q", envelope.Event, event)
		return false
	}
	if err := json.Unmarshal(envelope.Data, into); err != nil {
		p.t.Errorf("decode %s data: %v", event, err)
		return false
	}
	return true
}

func TestClientSessionHandshakeAndCommand(t *testing.T) {
	panel := newFakePanel(t)
	server := httptest.NewServer(panel.handler())
	defer server.Close()

	manager := &fakeManager{}
	c := newTestClient(manager)
	c.opts.PanelURL = server.URL

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan struct{})
	go func() {
		_ = c.Run(ctx)
		close(done)
	}()

	select {
	case hello := <-panel.hello:
		if hello.Protocol != ProtocolVersion {
			t.Fatalf("hello protocol = %d, want %d", hello.Protocol, ProtocolVersion)
		}
		if hello.DaemonVersion != "test" {
			t.Fatalf("hello daemonVersion = %q", hello.DaemonVersion)
		}
		if hello.Inventory.Hostname == "" || hello.Inventory.CPUCores <= 0 {
			t.Fatalf("hello inventory incomplete: %+v", hello.Inventory)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no hello within timeout")
	}

	select {
	case result := <-panel.results:
		if !result.OK || result.CommandID != testCommandID {
			t.Fatalf("result = %+v", result)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no result within timeout")
	}

	if calls := manager.recorded(); len(calls) != 1 || calls[0] != "stop "+testServerID {
		t.Fatalf("calls = %v", calls)
	}

	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("client did not stop on context cancel")
	}
}

func TestClientReconnectsAfterDisconnect(t *testing.T) {
	connections := make(chan struct{}, 4)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		connections <- struct{}{}
		// read the hello, then hang up to force a reconnect
		_, _, _ = conn.Read(r.Context())
		_ = conn.CloseNow()
	}))
	defer server.Close()

	c := newTestClient(&fakeManager{})
	c.opts.PanelURL = server.URL

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = c.Run(ctx) }()

	for range 2 {
		select {
		case <-connections:
		case <-time.After(10 * time.Second):
			t.Fatal("expected the client to reconnect")
		}
	}
}
