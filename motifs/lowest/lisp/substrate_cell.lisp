;;; Substrate cell motif in Lisp

(defconstant +fnv-offset+ #xCBF29CE484222325)
(defconstant +fnv-prime+  #x100000001B3)
(defconstant +canary+     #x024A555471370B18D)

(defun fnv1a-64 (string)
  "Compute FNV-1a 64-bit hash of a string."
  (let ((h +fnv-offset+))
    (loop for byte across (sb-ext:string-to-octets string :external-format :utf-8)
          do (setf h (logand (* (logxor h byte) +fnv-prime+) #xFFFFFFFFFFFFFFFF)))
    h))

(defun verify-canary ()
  "Verify the canonical canary."
  (= (fnv1a-64 "café Δ 日本語") +canary+))

;; Test
(format t "Canary matches: ~A~%" (verify-canary))
