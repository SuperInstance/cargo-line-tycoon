#ifndef FNV1A64_H
#define FNV1A64_H
#include <stdint.h>
#include <stddef.h>

#define FNV_OFFSET 0xcbf29ce484222325ULL
#define FNV_PRIME  0x100000001b3ULL
#define MASK_64    0xffffffffffffffffULL

static inline uint64_t fnv1a64(const char *s, size_t len) {
    uint64_t h = FNV_OFFSET;
    for (size_t i = 0; i < len; i++) {
        h ^= (uint8_t)s[i];
        h *= FNV_PRIME;
    }
    return h & MASK_64;
}

#define FLEET_CANARY_INPUT "café Δ 日本語"
#define FLEET_CANARY_HASH 0x024a555471370b18dULL

static inline int verify_canary(const char *s, size_t len) {
    return fnv1a64(s, len) == FLEET_CANARY_HASH;
}
#endif
