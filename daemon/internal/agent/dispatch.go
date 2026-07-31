package agent

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"

	"github.com/deko96/swifty/daemon/internal/supervisor"
)

var errBadServerID = errors.New("serverId must be a lowercase UUID")

// dispatch routes one inbound message. Unknown events are ignored by
// contract (the protocol is additive within a version); commands run on
// baseCtx in their own goroutine so a slow install neither blocks the read
// loop nor dies with the session that delivered it.
func (c *Client) dispatch(raw []byte) {
	var envelope Envelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		c.opts.Logger.Warn("agent channel: undecodable message", "error", err)
		return
	}
	switch envelope.Event {
	case CommandPower:
		var cmd PowerCommand
		if !c.decode(envelope, &cmd) {
			return
		}
		go c.execute(cmd.ID, func(ctx context.Context) (string, error) {
			return "", c.power(ctx, cmd)
		})
	case CommandInstall:
		var cmd InstallCommand
		if !c.decode(envelope, &cmd) {
			return
		}
		go c.execute(cmd.ID, func(ctx context.Context) (string, error) {
			return c.install(ctx, cmd)
		})
	case CommandSync:
		var cmd SyncCommand
		if !c.decode(envelope, &cmd) {
			return
		}
		go c.execute(cmd.ID, func(context.Context) (string, error) {
			return "", c.sync(cmd)
		})
	default:
		c.opts.Logger.Debug("agent channel: ignoring unknown event", "event", envelope.Event)
	}
}

func (c *Client) decode(envelope Envelope, into any) bool {
	if err := json.Unmarshal(envelope.Data, into); err != nil {
		c.opts.Logger.Warn("agent channel: undecodable command",
			"event", envelope.Event, "error", err)
		return false
	}
	return true
}

func (c *Client) execute(commandID string, run func(context.Context) (string, error)) {
	output, err := run(c.baseCtx)
	result := ResultEvent{
		Meta:      newMeta(),
		CommandID: commandID,
		OK:        err == nil,
		Output:    output,
	}
	if err != nil {
		result.Error = err.Error()
	}
	c.enqueue(EventResult, result)
}

func (c *Client) power(ctx context.Context, cmd PowerCommand) error {
	if !supervisor.ValidID(cmd.ServerID) {
		return errBadServerID
	}
	switch cmd.Action {
	case PowerStart:
		if err := validateStart(cmd); err != nil {
			return err
		}
		c.watcher.Track(cmd.ServerID)
		return c.opts.Manager.Start(ctx, c.startSpec(cmd))
	case PowerRestart:
		if err := validateStart(cmd); err != nil {
			return err
		}
		c.watcher.Track(cmd.ServerID)
		// the unit may not be running; a fresh start must succeed regardless
		_ = c.opts.Manager.Stop(ctx, cmd.ServerID)
		return c.opts.Manager.Start(ctx, c.startSpec(cmd))
	case PowerStop:
		return c.opts.Manager.Stop(ctx, cmd.ServerID)
	case PowerKill:
		return c.opts.Manager.Kill(ctx, cmd.ServerID)
	default:
		return errors.New("action must be start, restart, stop, or kill")
	}
}

func validateStart(cmd PowerCommand) error {
	if len(cmd.Command) == 0 || cmd.Command[0] == "" {
		return errors.New("start requires a command")
	}
	if cmd.Limits == nil || cmd.Limits.MemoryMiB <= 0 || cmd.Limits.CPUPercent <= 0 {
		return errors.New("start requires positive memoryMiB and cpuPercent limits")
	}
	return nil
}

func (c *Client) install(ctx context.Context, cmd InstallCommand) (string, error) {
	if !supervisor.ValidID(cmd.ServerID) {
		return "", errBadServerID
	}
	if cmd.Script == "" {
		return "", errors.New("install requires a script")
	}
	spec := c.spec(cmd.ServerID)
	spec.Env = cmd.Env
	output, err := c.opts.Manager.RunInstall(ctx, spec, cmd.Script)
	return string(output), err
}

func (c *Client) sync(cmd SyncCommand) error {
	ids := make([]string, 0, len(cmd.Servers))
	for _, server := range cmd.Servers {
		if !supervisor.ValidID(server.ServerID) {
			return errBadServerID
		}
		ids = append(ids, server.ServerID)
	}
	c.watcher.SetServers(ids)
	return nil
}

func (c *Client) spec(id string) supervisor.Spec {
	return supervisor.Spec{
		ID:        id,
		UnixUser:  supervisor.Username(id),
		Directory: filepath.Join(c.opts.DataDir, id),
	}
}

func (c *Client) startSpec(cmd PowerCommand) supervisor.Spec {
	spec := c.spec(cmd.ServerID)
	spec.Command = cmd.Command
	spec.Env = cmd.Env
	spec.Limits = cmd.Limits.Supervisor()
	return spec
}
