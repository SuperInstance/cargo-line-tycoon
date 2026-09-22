// The substrate cell motif in Go.
package substrate

import (
	"encoding/json"
	"fmt"
)

type SubstrateCell struct {
	ID              string                 `json:"id"`
	PrevHash        string                 `json:"prev_hash"`
	ConversationID  string                 `json:"conversation_id"`
	Source          string                 `json:"source"`
	State           map[string]interface{} `json:"state"`
}

// FNV-1a 64-bit hash. Matches fleet canary.
func Fnv1a64(s string) string {
	h := uint64(0xcbf29ce484222325)
	prime := uint64(0x100000001b3)
	for _, b := range []byte(s) {
		h ^= uint64(b)
		h *= prime
	}
	return fmt.Sprintf("0x%016x", h)
}

func (c *SubstrateCell) Hash() string {
	stateJSON, _ := json.Marshal(c.State)
	canonical := fmt.Sprintf("%s|%s|%s|%s|%s",
		c.ID, c.ConversationID, c.PrevHash, c.Source, string(stateJSON))
	return Fnv1a64(canonical)
}

// Test: canary must match
// func TestFnv1aCanary(t *testing.T) {
//     expected := "0x024a555471370b18d"
//     if got := Fnv1a64("café Δ 日本語"); got != expected {
//         t.Errorf("canary mismatch: %s != %s", got, expected)
//     }
// }
