"""
Jev-Shipwright: the reading system that knows when to stop measuring.

Combines:
- SplineSnaps (canonical anchors along analogue trajectories)
- QuantumEther (multi-basis projection of the substrate)
- kev-substrate (calibrated decision model with confidence)
- A "shipwright layer" that decides where to snap, where to leave negative space

The intuition: like a shipwright who knows ducks and battens, Jev-Shipwright
places precision snaps (ducks) where confidence is high, and trusts the 
unmeasured space (negative space, quantum superposition) to hold the structure
between them.

The negative space is NOT a placeholder — it IS the substrate. The shipwright
doesn't fill it because the substrate holds it. The reading system knows when
to stop measuring and let the build reveal itself.
"""
from __future__ import annotations
import json
import math
import time
from dataclasses import dataclass, field
from typing import Any, Optional

# We don't depend on kev at runtime — we MOCK its confidence behavior.
# Real kev: from kev.substrate import SubstrateClient


@dataclass
class SplineSnap:
    """A canonical anchor where Jev-Shipwright measured with high confidence."""
    snap_id: str
    t: float  # time coordinate (t-minus style)
    position: tuple  # (x, y) in question space
    question: str  # what was asked
    answer: Any  # Jev's response (could be noul, choice, score)
    confidence: float  # Jev's calibrated probability (0-1)
    basis: str  # which quantum basis was used ('|0⟩/|1⟩', '|+⟩/|−⟩', etc.)
    extra_dims: dict = field(default_factory=dict)
    
    def is_anchor(self) -> bool:
        """True if confidence is high enough to be a precision duck."""
        return self.confidence >= 0.7


@dataclass 
class NegativeSpace:
    """An unmeasured region between two snaps. Holds quantum superposition."""
    space_id: str
    t_start: float
    t_end: float
    basis: str  # the basis this space is "in"
    amplitude: complex  # quantum amplitude (mocked)
    
    def measure(self, observer_basis: str) -> Any:
        """Collapse superposition by measuring in a specific basis."""
        # Mock: just return the stored amplitude projection
        return self.amplitude


@dataclass
class ShipwrightReading:
    """The reading system's recommendation for one question."""
    question: str
    answer: Any
    confidence: float
    snap_decision: str  # "snap_here" | "snap_and_neighbors" | "leave_negative_space"
    rationale: str


class JevShipwright:
    """
    The reading system.
    
    Given a question, decides:
    1. Where to snap (precision duck)
    2. Where to leave negative space (quantum superposition)
    3. How much information is enough before moving forward
    """
    
    def __init__(self, confidence_threshold_anchor: float = 0.7, confidence_threshold_skip: float = 0.95):
        self.snaps: list[SplineSnap] = []
        self.spaces: list[NegativeSpace] = []
        self.threshold_anchor = confidence_threshold_anchor
        self.threshold_skip = confidence_threshold_skip
    
    def ask(self, question: str, state: Any = None, mock_confidence: Optional[float] = None) -> ShipwrightReading:
        """
        Ask Jev a question. The reading system decides how to record the answer.
        """
        # In real impl: call kev.substrate.SubstrateClient.systemone()
        # Mocked here: we either use provided confidence or simulate one
        if mock_confidence is not None:
            confidence = mock_confidence
            # Mock answer based on confidence
            if confidence > 0.9:
                answer = {"type": "noul", "noul": confidence, "value": "yes" if confidence > 0.5 else "no"}
            elif confidence > 0.5:
                answer = {"type": "choice", "choice": "billing" if confidence > 0.7 else "returns", "probabilities": {"billing": confidence, "returns": 1-confidence}}
            else:
                answer = {"type": "score", "score": confidence * 2, "confidence": 1 - confidence}
        else:
            # Simulate Jev: high confidence for clear questions, lower for ambiguous
            confidence = 0.5 + 0.3 * math.sin(hash(question) % 7)
            answer = {"type": "noul", "noul": confidence}
        
        # The shipwright decides what to do
        if confidence >= self.threshold_skip:
            # Skip even snapping — we trust the structure without measurement
            decision = "leave_negative_space"
            rationale = f"Confidence {confidence:.2f} >= {self.threshold_skip} — trust the substrate, no snap needed"
        elif confidence >= self.threshold_anchor:
            # Anchor here — place a precision duck
            decision = "snap_here"
            rationale = f"Confidence {confidence:.2f} >= {self.threshold_anchor} — high enough to be a precision anchor"
            self._make_snap(question, answer, confidence)
        else:
            # Need more measurement — snap here AND ask neighbors
            decision = "snap_and_neighbors"
            rationale = f"Confidence {confidence:.2f} < {self.threshold_anchor} — low confidence, snap + measure surroundings"
            self._make_snap(question, answer, confidence)
        
        return ShipwrightReading(
            question=question,
            answer=answer,
            confidence=confidence,
            snap_decision=decision,
            rationale=rationale,
        )
    
    def _make_snap(self, question: str, answer: Any, confidence: float):
        """Register a spline snap."""
        t = time.time()
        position = (hash(question) % 1000 / 1000, confidence)
        snap = SplineSnap(
            snap_id=f"snap-{len(self.snaps):04d}",
            t=t,
            position=position,
            question=question[:80],
            answer=answer,
            confidence=confidence,
            basis="|+⟩/|−⟩",  # mock
            extra_dims={
                "answer_type": answer.get("type", "?"),
                "duck_or_batten": "duck" if confidence >= 0.7 else "batten",
            },
        )
        self.snaps.append(snap)
    
    def report(self) -> str:
        """Generate the shipwright's progress report."""
        total = len(self.snaps)
        anchors = sum(1 for s in self.snaps if s.is_anchor())
        battens = total - anchors
        avg_conf = sum(s.confidence for s in self.snaps) / total if total else 0
        
        lines = [
            f"=== Shipwright Report ===",
            f"  Total snaps: {total}",
            f"  Precision ducks (anchors): {anchors}",
            f"  Battens (organizing spacers): {battens}",
            f"  Average confidence: {avg_conf:.3f}",
            f"  Negative space regions: {len(self.spaces)}",
            f"",
            f"  Recent snaps:",
        ]
        for s in self.snaps[-5:]:
            marker = "🦆" if s.is_anchor() else "▫️"
            lines.append(f"    {marker} {s.snap_id}  conf={s.confidence:.2f}  {s.question[:50]}")
        
        return "\n".join(lines)


def demo():
    """Demo: ask the shipwright some questions with varying confidence."""
    sw = JevShipwright()
    
    questions = [
        ("Is the customer frustrated?", 0.92),       # very high — skip
        ("Which department should handle this?", 0.78),  # anchor
        ("Will this lead to churn?", 0.42),          # snap + neighbors
        ("Is the address valid?", 0.98),            # skip
        ("What's the refund amount?", 0.55),        # snap + neighbors
        ("Should we escalate?", 0.81),              # anchor
        ("Is this a duplicate ticket?", 0.22),      # snap + neighbors
    ]
    
    for q, conf in questions:
        reading = sw.ask(q, mock_confidence=conf)
        print(f"Q: {q}")
        print(f"   Decision: {reading.snap_decision}")
        print(f"   Confidence: {reading.confidence:.2f}")
        print(f"   Rationale: {reading.rationale}")
        print()
    
    print(sw.report())


if __name__ == "__main__":
    demo()
