package supervisor

import "strings"

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

// Username derives the server's Unix user from its UUID, within the
// 32-character limit of useradd.
func Username(id string) string {
	clean := strings.ReplaceAll(id, "-", "")
	if len(clean) > usernameIDLength {
		clean = clean[:usernameIDLength]
	}
	return userPrefix + clean
}
