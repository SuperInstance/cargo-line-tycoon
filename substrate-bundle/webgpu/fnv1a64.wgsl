// FNV-1a 64-bit hash compute shader
// Hashes each uint32 in the input array to produce a 64-bit FNV-1a hash

struct HashInput {
    data: array<u32>,        // input bytes as u32 (4 bytes per u32)
    length: u32,              // actual byte length
};

struct HashOutput {
    hash: vec2<u32>,          // 64-bit hash (low 32, high 32)
};

const FNV_OFFSET: vec2<u32> = vec2<u32>(0xcbf29ce4u, 0x84222225u);
const FNV_PRIME: u32 = 0x010001b3u;

@group(0) @binding(0) var<storage, read> input: HashInput;
@group(0) @binding(1) var<storage, read_write> output: HashOutput;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    var h: vec2<u32> = FNV_OFFSET;
    let len = input.length;
    let n32 = (len + 3u) / 4u;
    
    for (var i: u32 = 0u; i < n32u; i = i + 1u) {
        let chunk = input.data[i];
        // Hash 4 bytes per chunk
        for (var b: u32 = 0u; b < 4u; b = b + 1u) {
            let byteIdx = i * 4u + b;
            if (byteIdx >= len) { break; }
            let byteVal = (chunk >> (b * 8u)) & 0xffu;
            
            // XOR low byte into low 32 bits of hash
            h[0] = h[0] ^ byteVal;
            
            // Multiply by FNV prime
            let lo = h[0] * FNV_PRIME;
            // Handle overflow into high bits
            let carry = select(0u, 1u, h[0] > 0xffffffffu / FNV_PRIME);
            let hi = h[1] * FNV_PRIME + carry;
            h[0] = lo;
            h[1] = hi;
        }
    }
    
    output.hash = h;
}
