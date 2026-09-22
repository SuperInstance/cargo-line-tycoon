# Makefile for the C99 substrate port of cargo-line-tycoon
# This is one of the 4 polyformal ports (TS / Rust / C / Python).
# All 4 must produce byte-exact FNV-1a 64-bit canary hashes.

CC       = gcc
CFLAGS   = -O2 -Wall -Wextra -std=c99
LDFLAGS  =
INCLUDES = -I.

SOURCES  = cell_algebra.c
HEADERS  = cell_algebra.h fnv1a64.h

.PHONY: all test clean canary polyformalism

all: test

test: canary
	@echo ""
	@echo "=== Building C99 port ==="
	$(CC) $(CFLAGS) $(SOURCES) test_algebra.c $(INCLUDES) -o test_algebra $(LDFLAGS)
	@echo ""
	@echo "=== Running algebraic law tests ==="
	./test_algebra

canary:
	@echo "=== Building canary test ==="
	$(CC) $(CFLAGS) $(INCLUDES) canary.c -o canary_test $(LDFLAGS)
	./canary_test

polyformalism: canary test
	@echo ""
	@echo "=== ALL polyformalism checks PASS for C99 port ==="
	@echo "Cross-language parity: TS, Rust, Python must agree"
	@echo ""
	@echo "Expected canary: 0x024a555471370b18d"

clean:
	rm -f test_algebra canary_test *.o
