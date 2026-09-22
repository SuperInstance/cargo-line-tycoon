"""The substrate cell motif in Mojo — GPU-native, vendor-universal."""
from sys import sizeof

@register_passable("trivial")
struct SubstrateCell:
    var id: String
    var prev_hash: String  # hex
    var conversation_id: String
    var source: String
    var state: String  # JSON
    
    fn __init__(inout self, id: String, prev_hash: String, source: String, state: String, conversation_id: String = "default"):
        self.id = id
        self.prev_hash = prev_hash
        self.conversation_id = conversation_id
        self.source = source
        self.state = state
    
    fn hash(self) -> String:
        # FNV-1a 64-bit, matches fleet canary
        let canonical = String(self.id) + "|" + String(self.conversation_id) + "|" + \
                       String(self.prev_hash) + "|" + String(self.source) + "|" + \
                       String(self.state)
        var h: UInt64 = 0xcbf29ce484222325
        let prime: UInt64 = 0x100000001b3
        for byte in canonical.as_bytes():
            h = h ^ UInt64(byte)
            h = h * prime
        return String("0x") + hex(h & 0xffffffffffffffff)


fn fnv1a_64(s: String) -> UInt64:
    """The canonical FNV-1a 64-bit hash."""
    var h: UInt64 = 0xcbf29ce484222325
    let prime: UInt64 = 0x100000001b3
    for byte in s.as_bytes():
        h = h ^ UInt64(byte)
        h = h * prime
    return h


# Canary: must equal 0x024a555471370b18d
fn test_canary():
    let h = fnv1a_64("café Δ 日本語")
    assert_equal(h, 0x024a555471370b18d)
