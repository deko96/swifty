package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

const testToken = "node_test-token"

func get(t *testing.T, url, bearer string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestHealthzIsPublic(t *testing.T) {
	server := httptest.NewServer(NewRouter(testToken))
	defer server.Close()

	resp := get(t, server.URL+"/healthz", "")
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["status"] != "ok" {
		t.Fatalf("status field = %q, want %q", body["status"], "ok")
	}
}

func TestSystemRequiresToken(t *testing.T) {
	server := httptest.NewServer(NewRouter(testToken))
	defer server.Close()

	for _, bearer := range []string{"", "node_wrong"} {
		resp := get(t, server.URL+"/v1/system", bearer)
		resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("bearer %q: status = %d, want %d", bearer, resp.StatusCode, http.StatusUnauthorized)
		}
	}
}

func TestSystemWithToken(t *testing.T) {
	server := httptest.NewServer(NewRouter(testToken))
	defer server.Close()

	resp := get(t, server.URL+"/v1/system", testToken)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["version"] == "" {
		t.Fatal("version missing from response")
	}
}
