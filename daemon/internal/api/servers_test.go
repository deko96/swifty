package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/deko96/swifty/daemon/internal/supervisor"
)

const (
	testID      = "0f5c9d2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f"
	testDataDir = "/opt/swifty/servers"
)

type call struct {
	method string
	spec   supervisor.Spec
	id     string
	script string
}

type fakeManager struct {
	calls []call
	state supervisor.State
	fail  map[string]error
}

func (f *fakeManager) record(method string, spec supervisor.Spec, id, script string) error {
	f.calls = append(f.calls, call{method: method, spec: spec, id: id, script: script})
	return f.fail[method]
}

func (f *fakeManager) EnsureUser(_ context.Context, spec supervisor.Spec) error {
	return f.record("EnsureUser", spec, "", "")
}

func (f *fakeManager) RemoveUser(_ context.Context, spec supervisor.Spec) error {
	return f.record("RemoveUser", spec, "", "")
}

func (f *fakeManager) Start(_ context.Context, spec supervisor.Spec) error {
	return f.record("Start", spec, "", "")
}

func (f *fakeManager) Stop(_ context.Context, id string) error {
	return f.record("Stop", supervisor.Spec{}, id, "")
}

func (f *fakeManager) Kill(_ context.Context, id string) error {
	return f.record("Kill", supervisor.Spec{}, id, "")
}

func (f *fakeManager) State(_ context.Context, id string) (supervisor.State, error) {
	err := f.record("State", supervisor.Spec{}, id, "")
	return f.state, err
}

func (f *fakeManager) RunInstall(_ context.Context, spec supervisor.Spec, script string) ([]byte, error) {
	err := f.record("RunInstall", spec, "", script)
	return []byte("install output"), err
}

func (f *fakeManager) methods() []string {
	names := make([]string, len(f.calls))
	for i, c := range f.calls {
		names[i] = c.method
	}
	return names
}

func serversTestServer(t *testing.T, manager *fakeManager) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(NewRouter(testToken, manager, testDataDir))
	t.Cleanup(server.Close)
	return server
}

func request(t *testing.T, method, url string, body any) *http.Response {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		if payload, err = json.Marshal(body); err != nil {
			t.Fatal(err)
		}
	}
	req, err := http.NewRequest(method, url, bytes.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+testToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func wantStatus(t *testing.T, resp *http.Response, want int) {
	t.Helper()
	if resp.StatusCode != want {
		t.Fatalf("status = %d, want %d", resp.StatusCode, want)
	}
}

func wantCalls(t *testing.T, manager *fakeManager, want ...string) {
	t.Helper()
	got := manager.methods()
	if len(got) != len(want) {
		t.Fatalf("calls = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("calls = %v, want %v", got, want)
		}
	}
}

func validStartBody() map[string]any {
	return map[string]any{
		"action":  "start",
		"command": []string{"./srcds_run", "-game", "cstrike"},
		"env":     map[string]string{"PORT": "27015"},
		"limits":  map[string]any{"cpuPercent": 100, "memoryMiB": 1024, "pids": 64},
	}
}

func TestServersRequireToken(t *testing.T) {
	manager := &fakeManager{}
	server := serversTestServer(t, manager)

	req, err := http.NewRequest(http.MethodPost, server.URL+"/v1/servers", bytes.NewReader([]byte("{}")))
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	wantStatus(t, resp, http.StatusUnauthorized)
	wantCalls(t, manager)
}

func TestCreateServer(t *testing.T) {
	manager := &fakeManager{}
	server := serversTestServer(t, manager)

	resp := request(t, http.MethodPost, server.URL+"/v1/servers", map[string]string{"id": testID})
	wantStatus(t, resp, http.StatusCreated)
	wantCalls(t, manager, "EnsureUser")

	spec := manager.calls[0].spec
	if spec.ID != testID {
		t.Fatalf("spec.ID = %q, want %q", spec.ID, testID)
	}
	if spec.UnixUser != supervisor.Username(testID) {
		t.Fatalf("spec.UnixUser = %q, want %q", spec.UnixUser, supervisor.Username(testID))
	}
	if want := filepath.Join(testDataDir, testID); spec.Directory != want {
		t.Fatalf("spec.Directory = %q, want %q", spec.Directory, want)
	}
}

func TestCreateServerRejectsBadID(t *testing.T) {
	manager := &fakeManager{}
	server := serversTestServer(t, manager)

	for _, id := range []string{"", "not-a-uuid", "../../../etc", testID + "x", "0F5C9D2E-1A2B-4C3D-8E4F-5A6B7C8D9E0F"} {
		resp := request(t, http.MethodPost, server.URL+"/v1/servers", map[string]string{"id": id})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("id %q: status = %d, want %d", id, resp.StatusCode, http.StatusBadRequest)
		}
	}
	wantCalls(t, manager)
}

func TestCreateServerSurfacesFailure(t *testing.T) {
	manager := &fakeManager{fail: map[string]error{"EnsureUser": errors.New("useradd exploded")}}
	server := serversTestServer(t, manager)

	resp := request(t, http.MethodPost, server.URL+"/v1/servers", map[string]string{"id": testID})
	wantStatus(t, resp, http.StatusInternalServerError)
}

func TestGetServerState(t *testing.T) {
	manager := &fakeManager{state: supervisor.StateRunning}
	server := serversTestServer(t, manager)

	resp := request(t, http.MethodGet, server.URL+"/v1/servers/"+testID, nil)
	wantStatus(t, resp, http.StatusOK)

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["state"] != string(supervisor.StateRunning) {
		t.Fatalf("state = %q, want %q", body["state"], supervisor.StateRunning)
	}
	if body["id"] != testID {
		t.Fatalf("id = %q, want %q", body["id"], testID)
	}
}

func TestPowerStart(t *testing.T) {
	manager := &fakeManager{}
	server := serversTestServer(t, manager)

	resp := request(t, http.MethodPost, server.URL+"/v1/servers/"+testID+"/power", validStartBody())
	wantStatus(t, resp, http.StatusNoContent)
	wantCalls(t, manager, "Start")

	spec := manager.calls[0].spec
	if len(spec.Command) != 3 || spec.Command[0] != "./srcds_run" {
		t.Fatalf("spec.Command = %v", spec.Command)
	}
	if spec.Env["PORT"] != "27015" {
		t.Fatalf("spec.Env = %v", spec.Env)
	}
	if spec.Limits.MemoryMiB != 1024 || spec.Limits.CPUPercent != 100 || spec.Limits.Pids != 64 {
		t.Fatalf("spec.Limits = %+v", spec.Limits)
	}
}

func TestPowerStartValidation(t *testing.T) {
	manager := &fakeManager{}
	server := serversTestServer(t, manager)

	noCommand := validStartBody()
	noCommand["command"] = []string{}
	noLimits := validStartBody()
	noLimits["limits"] = map[string]any{"cpuPercent": 0, "memoryMiB": 0}

	for name, body := range map[string]map[string]any{"noCommand": noCommand, "noLimits": noLimits} {
		resp := request(t, http.MethodPost, server.URL+"/v1/servers/"+testID+"/power", body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want %d", name, resp.StatusCode, http.StatusBadRequest)
		}
	}
	wantCalls(t, manager)
}

func TestPowerRestartStopsFirst(t *testing.T) {
	manager := &fakeManager{fail: map[string]error{"Stop": errors.New("unit not loaded")}}
	server := serversTestServer(t, manager)

	body := validStartBody()
	body["action"] = "restart"
	resp := request(t, http.MethodPost, server.URL+"/v1/servers/"+testID+"/power", body)
	wantStatus(t, resp, http.StatusNoContent)
	wantCalls(t, manager, "Stop", "Start")
}

func TestPowerStopAndKill(t *testing.T) {
	for _, action := range []string{"stop", "kill"} {
		manager := &fakeManager{}
		server := serversTestServer(t, manager)

		resp := request(t, http.MethodPost, server.URL+"/v1/servers/"+testID+"/power", map[string]string{"action": action})
		wantStatus(t, resp, http.StatusNoContent)
		if manager.calls[0].id != testID {
			t.Fatalf("id = %q, want %q", manager.calls[0].id, testID)
		}
	}
}

func TestPowerRejectsUnknownAction(t *testing.T) {
	manager := &fakeManager{}
	server := serversTestServer(t, manager)

	resp := request(t, http.MethodPost, server.URL+"/v1/servers/"+testID+"/power", map[string]string{"action": "explode"})
	wantStatus(t, resp, http.StatusBadRequest)
	wantCalls(t, manager)
}

func TestInstall(t *testing.T) {
	manager := &fakeManager{}
	server := serversTestServer(t, manager)

	resp := request(t, http.MethodPost, server.URL+"/v1/servers/"+testID+"/install",
		map[string]any{"script": "steamcmd +login anonymous", "env": map[string]string{"APPID": "232330"}})
	wantStatus(t, resp, http.StatusOK)
	wantCalls(t, manager, "RunInstall")

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["output"] != "install output" {
		t.Fatalf("output = %q", body["output"])
	}
	if manager.calls[0].script != "steamcmd +login anonymous" {
		t.Fatalf("script = %q", manager.calls[0].script)
	}
	if manager.calls[0].spec.Env["APPID"] != "232330" {
		t.Fatalf("env = %v", manager.calls[0].spec.Env)
	}
}

func TestInstallRequiresScript(t *testing.T) {
	manager := &fakeManager{}
	server := serversTestServer(t, manager)

	resp := request(t, http.MethodPost, server.URL+"/v1/servers/"+testID+"/install", map[string]string{"script": ""})
	wantStatus(t, resp, http.StatusBadRequest)
	wantCalls(t, manager)
}

func TestInstallFailureIncludesOutput(t *testing.T) {
	manager := &fakeManager{fail: map[string]error{"RunInstall": errors.New("install failed: exit 1")}}
	server := serversTestServer(t, manager)

	resp := request(t, http.MethodPost, server.URL+"/v1/servers/"+testID+"/install",
		map[string]string{"script": "exit 1"})
	wantStatus(t, resp, http.StatusInternalServerError)

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["output"] != "install output" {
		t.Fatalf("output = %q, want install output alongside the error", body["output"])
	}
}

func TestDeleteServer(t *testing.T) {
	manager := &fakeManager{fail: map[string]error{"Kill": errors.New("unit not loaded")}}
	server := serversTestServer(t, manager)

	resp := request(t, http.MethodDelete, server.URL+"/v1/servers/"+testID, nil)
	wantStatus(t, resp, http.StatusNoContent)
	wantCalls(t, manager, "Kill", "RemoveUser")

	if manager.calls[1].spec.UnixUser != supervisor.Username(testID) {
		t.Fatalf("RemoveUser user = %q, want %q", manager.calls[1].spec.UnixUser, supervisor.Username(testID))
	}
}
