// The substrate cell motif in JavaScript (TypeScript-style).
export class SubstrateCell {
    constructor(id, prevHash, source, state, conversationId = 'default') {
        this.id = id;
        this.prevHash = prevHash;
        this.source = source;
        this.state = state;
        this.conversationId = conversationId;
        this.witnesses = [];
    }
    
    hash() {
        // FNV-1a 64-bit
        const canonical = `${this.id}|${this.conversationId}|${this.prevHash}|${this.source}|${JSON.stringify(this.state)}`;
        let h = 0xcbf29ce484222325n;
        const prime = 0x100000001b3n;
        for (const byte of new TextEncoder().encode(canonical)) {
            h ^= BigInt(byte);
            h = (h * prime) & 0xffffffffffffffffn;
        }
        return `0x${h.toString(16).padStart(16, '0')}`;
    }
}

export function fnv1a_64(s) {
    let h = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (const byte of new TextEncoder().encode(s)) {
        h ^= BigInt(byte);
        h = (h * prime) & 0xffffffffffffffffn;
    }
    return `0x${h.toString(16).padStart(16, '0')}`;
}

// Canary test
const TEST_CANARY = fnv1a_64('café Δ 日本語');
console.assert(TEST_CANARY === '0x024a555471370b18d', 'FNV-1a canary mismatch');
