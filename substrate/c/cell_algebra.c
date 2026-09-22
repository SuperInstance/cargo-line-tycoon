#include "cell_algebra.h"
#include <stdlib.h>
#include <string.h>

cell_t op_bind(cell_t template) {
    template.last_op = OPCODE_BIND;
    return template;
}

edge_t op_link(cell_id a, cell_id b, const char *edge_type) {
    edge_t e = { .from = a, .to = b, .edge_type = edge_type };
    return e;
}

void *op_effect(cell_t c, void *(*behavior)(void *)) {
    c.last_op = OPCODE_EFFECT;
    return behavior ? behavior(c.state) : c.state;
}

void *op_view(cell_t c) {
    return c.state;
}

cell_t op_tick(cell_t c, uint64_t timestamp) {
    c.last_op = OPCODE_TICK;
    c.witness_len++;
    return c;
}

bool law_L1_bind_idempotence(void) {
    cell_t c = { .id = 42, .state = NULL, .witness_len = 0, .last_op = OPCODE_TICK };
    cell_t c2 = op_bind(c);
    cell_t c3 = op_bind(c2);
    return c3.id == c.id && c3.witness_len == c.witness_len;
}

bool law_L3_view_purity(void) {
    int x = 42;
    cell_t c = { .id = 1, .state = &x, .witness_len = 0 };
    void *v1 = op_view(c);
    void *v2 = op_view(op_bind(c));
    return v1 == v2 && *(int*)v1 == 42;
}
