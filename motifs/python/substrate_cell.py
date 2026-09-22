"""The substrate cell motif in Python (canonical)."""
from dataclasses import dataclass, field
from typing import Any
import hashlib


@dataclass
class SubstrateCell:
    """The irreducible unit. ID, prev_hash, content_hash, state, witnesses."""
    id: str
    prev_hash: str  # hex
    state: dict
    source: str
    conversation_id: str = 'default'
    witnesses: list = field(default_factory=list)
    
    @property
    def hash(self) -> str:
        """Content hash (FNV-1a 64-bit, matches fleet canary)."""
        canonical = f"{self.id}|{self.conversation_id}|{self.prev_hash}|{self.source}|{json.dumps(self.state, sort_keys=True)}"
        return self._fnv1a_64(canonical)
    
    @staticmethod
    def _fnv1a_64(s: str) -> str:
        h = 0xcbf29ce484222325
        for byte in s.encode('utf-8'):
            h ^= byte
            h = (h * 0x100000001b3) & 0xffffffffffffffff
        return f'0x{h:016x}'


import json
