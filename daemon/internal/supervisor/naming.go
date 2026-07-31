package supervisor

import (
	"regexp"
	"strings"
)

const (
	unitPrefix = "swifty-"
	userPrefix = "sv_"

	// useradd truncates at 32 characters; 12 hex chars of the UUID keep the
	// name short, unique enough per node, and recognizable in ps output.
	usernameIDLength = 12
)

func UnitName(id string) string {
	return unitPrefix + id + ".service"
}

// Server IDs become unit names, usernames, and filesystem paths, so only
// canonical lowercase UUIDs are accepted anywhere an ID enters the daemon.
var idPattern = regexp.MustCompile(
	`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func ValidID(id string) bool {
	return idPattern.MatchString(id)
}

// Username derives the server's Unix user from its UUID, within the
// 32-character limit of useradd.
func Username(id string) string {
	clean := strings.ReplaceAll(id, "-", "")
	if len(clean) > usernameIDLength {
		clean = clean[:usernameIDLength]
	}
	return userPrefix + clean
}
