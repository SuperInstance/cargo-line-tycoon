#include "fnv1a64.h"
#include <stdio.h>
#include <string.h>

int main() {
    const char *canary_input = FLEET_CANARY_INPUT;
    size_t len = strlen(canary_input);
    uint64_t h = fnv1a64(canary_input, len);
    
    printf("C99 port: fnv1a64(\"%s\") = 0x%016lx\n", canary_input, h);
    printf("Expected:                0x%016lx\n", FLEET_CANARY_HASH);
    printf("Match: %s\n", h == FLEET_CANARY_HASH ? "YES" : "NO");
    
    // Polyformalism check: same payload as TS/Rust
    const char *ts_payload = "{\"s\":\"hello\",\"t\":\"test\",\"b\":null}";
    uint64_t ts_addr = fnv1a64(ts_payload, strlen(ts_payload));
    printf("\nPolyformalism check:\n");
    printf("  payload: %s\n", ts_payload);
    printf("  C99 hash:   0x%016lx\n", ts_addr);
    printf("  Expected:   0x96de3eeaabd90b9b\n");
    printf("  Match: %s\n", ts_addr == 0x96de3eeaabd90b9bULL ? "YES" : "NO");
    
    return h == FLEET_CANARY_HASH ? 0 : 1;
}
