\\ Substrate cell motif in Forth (concatenative)

\\ FNV-1a 64-bit constants
0xCBF29CE484222325 CONSTANT FNV-OFFSET
0x0000000010000001B3  CONSTANT FNV-PRIME
0x100000000          CONSTANT MASK-32

\\ FNV-1a 64-bit hash
: FNV1A ( addr len -- hash )
  FNV-OFFSET
  SWAP 0 DO
    DUP C@
    XOR
    FNV-PRIME M*
    DROP MASK-32 AND
    SWAP 1+ SWAP
  LOOP
  DROP
;

\\ Verify canary
: VERIFY-CANARY ( -- 0|1 )
  S" café Δ 日本語"
  FNV1A
  0x024a555471370b18d =
;

\\ Test
VERIFY-CANARY .
