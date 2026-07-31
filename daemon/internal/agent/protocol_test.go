package agent

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

const fixtureDir = "../../../packages/sdk/fixtures/agent"

// Round-trips every shared fixture through its Go type: decoding with
// DisallowUnknownFields proves Go knows every field the fixture carries, and
// re-encoding back to the original JSON proves Go emits the same shape. The
// SDK spec (packages/sdk/src/agent.spec.ts) holds the TypeScript side to the
// same fixtures.
func TestFixturesRoundTrip(t *testing.T) {
	cases := []struct {
		file    string
		event   string
		message any
	}{
		{"command.power.json", CommandPower, &PowerCommand{}},
		{"command.install.json", CommandInstall, &InstallCommand{}},
		{"command.sync.json", CommandSync, &SyncCommand{}},
		{"event.hello.json", EventHello, &HelloEvent{}},
		{"event.state.json", EventState, &StateEvent{}},
		{"event.install.progress.json", EventInstallProgress, &InstallProgressEvent{}},
		{"event.result.json", EventResult, &ResultEvent{}},
	}

	for _, tc := range cases {
		t.Run(tc.file, func(t *testing.T) {
			raw, err := os.ReadFile(filepath.Join(fixtureDir, tc.file))
			if err != nil {
				t.Fatalf("read fixture: %v", err)
			}

			var envelope Envelope
			if err := strictDecode(raw, &envelope); err != nil {
				t.Fatalf("decode envelope: %v", err)
			}
			if envelope.Event != tc.event {
				t.Fatalf("event = %q, want %q", envelope.Event, tc.event)
			}
			if err := strictDecode(envelope.Data, tc.message); err != nil {
				t.Fatalf("decode data: %v", err)
			}

			meta := reflect.ValueOf(tc.message).Elem().FieldByName("Meta").Interface().(Meta)
			if meta.V != ProtocolVersion {
				t.Fatalf("v = %d, want %d", meta.V, ProtocolVersion)
			}
			if meta.ID == "" {
				t.Fatal("message id is empty")
			}

			data, err := json.Marshal(tc.message)
			if err != nil {
				t.Fatalf("marshal data: %v", err)
			}
			encoded, err := json.Marshal(Envelope{Event: tc.event, Data: data})
			if err != nil {
				t.Fatalf("marshal envelope: %v", err)
			}
			var got, want any
			if err := json.Unmarshal(encoded, &got); err != nil {
				t.Fatalf("reparse encoded: %v", err)
			}
			if err := json.Unmarshal(raw, &want); err != nil {
				t.Fatalf("reparse fixture: %v", err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("round-trip mismatch:\n got %s\nwant %s", encoded, bytes.TrimSpace(raw))
			}
		})
	}
}

func strictDecode(raw []byte, into any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	return decoder.Decode(into)
}
