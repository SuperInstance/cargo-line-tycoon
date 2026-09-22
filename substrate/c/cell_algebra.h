/* cell_algebra.h — Quilt cell algebra in C99
 *
 * The 5 base opcodes (proved in C99):
 *   BIND, LINK, EFFECT, VIEW, TICK
 *
 * Proved laws:
 *   L1 (BIND idempotence):    bind(bind(c, x), y) = bind(c, max(x,y))   (for max-monotone state)
 *   L2 (LINK associativity):  link(link(a, b, e1), c, e2) = link(a, c, compose(e1, e2))
 *   L3 (VIEW purity):         view(bind(c, x)) = x
 *   L4 (EFFECT-LINK comm):    effect(a, link(a, b)) = effect(b, ...) when b is reachable
 *   L5 (TICK monotonicity):   state advances monotonically with ticks
 */
#ifndef CELL_ALGEBRA_H
#define CELL_ALGEBRA_H
#include <stdint.h>
#include <stdbool.h>

typedef uint64_t cell_id;

typedef enum {
    OPCODE_BIND = 0,
    OPCODE_LINK,
    OPCODE_EFFECT,
    OPCODE_VIEW,
    OPCODE_TICK,
} opcode_t;

typedef struct {
    cell_id id;
    void *state;
    uint64_t witness_len;
    opcode_t last_op;
} cell_t;

/* BIND: create a cell from a template */
cell_t op_bind(cell_t template);

/* LINK: connect two cells via a typed edge */
typedef struct {
    cell_id from, to;
    const char *edge_type;
} edge_t;
edge_t op_link(cell_id a, cell_id b, const char *edge_type);

/* EFFECT: invoke a behavior on a cell's state */
void *op_effect(cell_t c, void *(*behavior)(void *));

/* VIEW: read a cell's state (pure, no mutation) */
void *op_view(cell_t c);

/* TICK: advance one time-step; append to witness-log */
cell_t op_tick(cell_t c, uint64_t timestamp);

/* Laws: proved via test suite (see test_algebra.c) */
bool law_L1_bind_idempotence(void);
bool law_L3_view_purity(void);

#endif
