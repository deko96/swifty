package agent

import (
	"crypto/rand"
	"encoding/json"
	"fmt"

	"github.com/deko96/swifty/daemon/internal/supervisor"
)

// outboundBuffer bounds the events queued while the panel is unreachable.
// Producers block when it fills — state changes and command results are
// never dropped, the panel catches up on reconnect.
const outboundBuffer = 256

func (c *Client) enqueue(event string, data any) {
	envelope, err := makeEnvelope(event, data)
	if err != nil {
		c.opts.Logger.Error("agent channel: unencodable event", "event", event, "error", err)
		return
	}
	select {
	case c.outbound <- envelope:
	case <-c.baseCtx.Done():
	}
}

func (c *Client) emitState(id string, state supervisor.State) {
	c.enqueue(EventState, StateEvent{
		Meta:     newMeta(),
		ServerID: id,
		State:    state,
	})
}

func makeEnvelope(event string, data any) (Envelope, error) {
	raw, err := json.Marshal(data)
	if err != nil {
		return Envelope{}, err
	}
	return Envelope{Event: event, Data: raw}, nil
}

// mustEnvelope is for messages built entirely from marshalable types, where
// an encoding error is a programming bug.
func mustEnvelope(event string, data any) Envelope {
	envelope, err := makeEnvelope(event, data)
	if err != nil {
		panic(err)
	}
	return envelope
}

func newMeta() Meta {
	return Meta{V: ProtocolVersion, ID: newID()}
}

// newID returns a random UUIDv4; message ids only need uniqueness.
func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
