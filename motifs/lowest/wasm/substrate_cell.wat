;;; Substrate cell motif in WebAssembly Text
(module
  (global $FNV_OFFSET i64 (i64.const 0xcbf29ce484222325))
  (global $FNV_PRIME  i64 (i64.const 0x100000001b3))
  (memory (export "memory") 1)
  
  (func $fnv1a_64 (export "fnv1a_64") (param $ptr i32) (param $len i32) (result i64)
    (local $i i32)
    (local $h i64)
    (local $b i64)
    
    (local.set $h (global.get $FNV_OFFSET))
    (local.set $i (i32.const 0))
    
    (block $exit
      (loop $loop
        (br_if $exit (i32.ge_s (local.get $i) (local.get $len)))
        (local.set $b (i64.load8_u (i32.add (local.get $ptr) (local.get $i))))
        (local.set $h (i64.xor (local.get $h) (local.get $b)))
        (local.set $h (i64.mul (local.get $h) (global.get $FNV_PRIME)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
    
    (local.get $h)
  )
  
  (func $verify_canary (export "verify_canary") (result i32)
    (i32.store8  (i32.const 0)  (i32.const 0x63))  ;; c
    (i32.store8  (i32.const 1)  (i32.const 0x61))  ;; a
    (i32.store8  (i32.const 2)  (i32.const 0x66))  ;; f
    (i32.store8  (i32.const 3)  (i32.const 0xc3))  ;; é1
    (i32.store8  (i32.const 4)  (i32.const 0xa9))  ;; é2
    (i32.store8  (i32.const 5)  (i32.const 0x20))  ;; space
    (i32.store8  (i32.const 6)  (i32.const 0xce))  ;; Δ1
    (i32.store8  (i32.const 7)  (i32.const 0x94))  ;; Δ2
    (i32.store8  (i32.const 8)  (i32.const 0x20))  ;; space
    (i32.store8  (i32.const 9)  (i32.const 0xe6))  ;; 日1
    (i32.store8  (i32.const 10) (i32.const 0x97))  ;; 日2
    (i32.store8  (i32.const 11) (i32.const 0xa5))  ;; 日3
    (i32.store8  (i32.const 12) (i32.const 0xe6))  ;; 本1
    (i32.store8  (i32.const 13) (i32.const 0x9c))  ;; 本2
    (i32.store8  (i32.const 14) (i32.const 0xac))  ;; 本3
    (i32.store8  (i32.const 15) (i32.const 0xe8))  ;; 語1
    (i32.store8  (i32.const 16) (i32.const 0xaa))  ;; 語2
    (i32.store8  (i32.const 17) (i32.const 0x9e))  ;; 語3
    
    (if (i64.eq (call $fnv1a_64 (i32.const 0) (i32.const 18)) (i64.const 0x024a555471370b18d))
      (then (i32.const 1))
      (else (i32.const 0))
    )
  )
)
