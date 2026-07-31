package agent

import (
	"context"
	"encoding/json"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/deko96/swifty/daemon/internal/supervisor"
)

// ServerManager is the slice of the supervisor the agent channel drives.
type ServerManager interface {
	Start(ctx context.Context, spec supervisor.Spec) error
	Stop(ctx context.Context, id string) error
	Kill(ctx context.Context, id string) error
	State(ctx context.Context, id string) (supervisor.State, error)
	RunInstall(ctx context.Context, spec supervisor.Spec, script string) ([]byte, error)
}

const (
	channelPath     = "/agent"
	dialTimeout     = 10 * time.Second
	writeTimeout    = 10 * time.Second
	pingInterval    = 30 * time.Second
	initialBackoff  = time.Second
	maxBackoff      = time.Minute
	stableSession   = time.Minute
	maxMessageBytes = 1 << 20
	watchInterval   = 2 * time.Second
)

type Options struct {
	PanelURL      string
	Token         string
	DataDir       string
	DaemonVersion string
	Manager       ServerManager
	Logger        *slog.Logger
}

// Client keeps a persistent WebSocket to the panel: commands are dispatched
// to the supervisor as they arrive, events flow back through a buffered
// outbound queue that survives reconnects, so no state change is lost while
// the panel is away.
type Client struct {
	opts     Options
	outbound chan Envelope
	watcher  *watcher
	// baseCtx outlives any single connection: commands (installs above all)
	// and queued events must not die with the session that delivered them.
	baseCtx context.Context
	// pending holds a message whose write failed, to retry next session.
	// Only writeLoop touches it, and session() drains all loop goroutines
	// before returning, so sessions never overlap.
	pending *Envelope
}

func NewClient(opts Options) *Client {
	client := &Client{
		opts:     opts,
		outbound: make(chan Envelope, outboundBuffer),
		baseCtx:  context.Background(),
	}
	client.watcher = newWatcher(opts.Manager, opts.Logger, client.emitState)
	return client
}

// Run dials the panel and keeps the channel alive until ctx is done,
// reconnecting with jittered exponential backoff.
func (c *Client) Run(ctx context.Context) error {
	c.baseCtx = ctx
	go c.watcher.run(ctx)

	backoff := initialBackoff
	for {
		started := time.Now()
		err := c.session(ctx)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if time.Since(started) >= stableSession {
			backoff = initialBackoff
		}
		c.opts.Logger.Warn("agent channel disconnected",
			"error", err, "reconnectIn", backoff.String())
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(jitter(backoff)):
		}
		backoff = min(backoff*2, maxBackoff)
	}
}

func (c *Client) session(ctx context.Context) error {
	dialCtx, cancel := context.WithTimeout(ctx, dialTimeout)
	conn, _, err := websocket.Dial(dialCtx, c.endpoint(), &websocket.DialOptions{
		HTTPHeader: http.Header{"Authorization": {"Bearer " + c.opts.Token}},
	})
	cancel()
	if err != nil {
		return err
	}
	defer conn.CloseNow()
	conn.SetReadLimit(maxMessageBytes)

	sessionCtx, cancelSession := context.WithCancel(ctx)
	defer cancelSession()

	if err := c.writeMessage(sessionCtx, conn, c.hello()); err != nil {
		return err
	}
	c.opts.Logger.Info("agent channel connected", "panel", c.opts.PanelURL)

	errCh := make(chan error, 3)
	go func() { errCh <- c.readLoop(sessionCtx, conn) }()
	go func() { errCh <- c.writeLoop(sessionCtx, conn) }()
	go func() { errCh <- c.pingLoop(sessionCtx, conn) }()

	err = <-errCh
	cancelSession()
	_ = conn.CloseNow()
	<-errCh
	<-errCh
	return err
}

func (c *Client) endpoint() string {
	return strings.TrimRight(c.opts.PanelURL, "/") + channelPath
}

func (c *Client) hello() Envelope {
	return mustEnvelope(EventHello, HelloEvent{
		Meta:          newMeta(),
		Protocol:      ProtocolVersion,
		DaemonVersion: c.opts.DaemonVersion,
		Inventory:     collectInventory(c.opts.DataDir),
		Ports:         []PortProbe{},
	})
}

func (c *Client) readLoop(ctx context.Context, conn *websocket.Conn) error {
	for {
		_, raw, err := conn.Read(ctx)
		if err != nil {
			return err
		}
		c.dispatch(raw)
	}
}

func (c *Client) writeLoop(ctx context.Context, conn *websocket.Conn) error {
	if c.pending != nil {
		if err := c.writeMessage(ctx, conn, *c.pending); err != nil {
			return err
		}
		c.pending = nil
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case envelope := <-c.outbound:
			if err := c.writeMessage(ctx, conn, envelope); err != nil {
				c.pending = &envelope
				return err
			}
		}
	}
}

func (c *Client) writeMessage(ctx context.Context, conn *websocket.Conn, envelope Envelope) error {
	raw, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	return conn.Write(writeCtx, websocket.MessageText, raw)
}

func (c *Client) pingLoop(ctx context.Context, conn *websocket.Conn) error {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := conn.Ping(ctx); err != nil {
				return err
			}
		}
	}
}

func jitter(d time.Duration) time.Duration {
	return d/2 + rand.N(d)
}
