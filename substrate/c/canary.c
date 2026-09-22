/* canary.c — the single canary test that proves C99 port parity with TS/Rust/Python.
 *
 * Must produce 0x024a555471370b18d for input "café Δ 日本語".
 * Must match the byte-exact output of all other language ports.
 */
#include "fnv1a64.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#define CANARY_INPUT "café Δ 日本語"
#define CANARY_HASH 0x024a555471370b18dULL

int main(void) {
    uint64_t h = fnv1a64(CANARY_INPUT, strlen(CANARY_INPUT));
    printf("  C99 port: fnv1a64(\"%s\") = 0x%016lx\n", CANARY_INPUT, h);
    printf("  Expected:                0x024a555471370b18d\n");
    printf("  Match: %s\n", h == CANARY_HASH ? "PASS" : "FAIL");
    
    /* Polyformalism check: same payload as TS port */
    const char *ts_payload = "{\"s\":\"hello\",\"t\":\"test\",\"b\":null}";
    uint64_t ts_addr = fnv1a64(ts_payload, strlen(ts_payload));
    printf("\n  Cross-language parity check:\n");
    printf("    payload: %s\n", ts_payload);
    printf("    C99 hash:   0x%016lx\n", ts_addr);
    printf("    Expected:   0x96de3eeaabd90b9b\n");
    printf("    Match: %s\n", ts_addr == 0x96de3eeaabd90b9bULL ? "PASS" : "FAIL");
    
    return (h == CANARY_HASH && ts_addr == 0x96de3eeaabd90b9bULL) ? 0 : 1;
}
