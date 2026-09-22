#include "cell_algebra.h"
#include <stdio.h>

int main() {
    printf("L1 (bind idempotence): %s\n", law_L1_bind_idempotence() ? "PASS" : "FAIL");
    printf("L3 (view purity):      %s\n", law_L3_view_purity() ? "PASS" : "FAIL");
    
    int x = 10;
    cell_t c = { .id = 1, .state = &x };
    void *doubled = op_effect(c, NULL);
    printf("Effect (no behavior) returns state: %d\n", doubled ? *(int*)doubled : -1);
    
    return 0;
}
