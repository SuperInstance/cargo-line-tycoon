"""
Maker Animation — Casey persona-iteration doctrine in code.

Given a GitHub handle, animate that maker's trajectory through the
SuperInstance substrate. Shows:
- Vertical: their activity over time (pushes, comments, canon submissions)
- Horizontal: what other makers were doing at each timestamp
- Synoptic: the JEV/JEPA reading of "values, weights, trajectories"

History is through the eyes of the embedder. Each run embeds differently.
"""
from __future__ import annotations
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict
from typing import Any

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
SUBSTRATE_URL = "https://quilt-distributed.casey-digennaro.workers.dev"

@dataclass
class MakerEvent:
    """One event in a maker's trajectory."""
    timestamp: int
    event_type: str  # "push", "pr_open", "pr_merge", "issue_open", "comment", "canon_submit"
    repo: str
    detail: str
    content_excerpt: str = ""
    metadata: dict = field(default_factory=dict)


def gh_api(path: str) -> Any:
    """Authenticated GitHub API call."""
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "User-Agent": "maker-animator/1.0",
            "Accept": "application/vnd.github.v3+json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:200]}


def fetch_maker_trajectory(handle: str, limit: int = 100) -> list[MakerEvent]:
    """
    Fetch a maker's GitHub activity (events API + recent PRs/issues) and
    canon submissions from the substrate.
    """
    events = []
    
    # GitHub Events API
    event_data = gh_api(f"/users/{handle}/events/public?per_page=100")
    if isinstance(event_data, list):
        for e in event_data:
            ts = datetime.fromisoformat(e["created_at"].replace("Z", "+00:00")).timestamp()
            etype = e.get("type", "")
            repo = e.get("repo", {}).get("name", "?")
            
            # Map GitHub event types to our vocabulary
            type_map = {
                "PushEvent": "push",
                "PullRequestEvent": ("pr_" + (e.get("payload", {}).get("action") or "")),
                "PullRequestReviewEvent": "pr_review",
                "PullRequestReviewCommentEvent": "pr_comment",
                "IssuesEvent": ("issue_" + (e.get("payload", {}).get("action") or "")),
                "IssueCommentEvent": "issue_comment",
                "CreateEvent": "create",
                "DeleteEvent": "delete",  # would not normally see this; archived instead
                "ForkEvent": "fork",
                "WatchEvent": "star",
                "ReleaseEvent": "release",
            }
            mapped = type_map.get(etype, etype.lower())
            
            # Detail string
            payload = e.get("payload", {})
            detail = ""
            if etype == "PushEvent":
                commits = payload.get("commits", [])
                if commits:
                    detail = commits[0].get("message", "")[:100]
            elif "PullRequest" in etype:
                pr = payload.get("pull_request", {})
                detail = pr.get("title", "")
            elif etype == "IssuesEvent":
                issue = payload.get("issue", {})
                detail = issue.get("title", "")
            
            events.append(MakerEvent(
                timestamp=int(ts),
                event_type=mapped,
                repo=repo,
                detail=detail,
            ))
    
    # Add canon submissions from substrate (search for maker's name in canon)
    canon = gh_api(f"/search/issues?q=author:{handle}+org:SuperInstance+type:pr&per_page=20")
    if isinstance(canon, dict) and canon.get("items"):
        for pr in canon.get("items", []):
            ts = datetime.fromisoformat(pr["created_at"].replace("Z", "+00:00")).timestamp()
            events.append(MakerEvent(
                timestamp=int(ts),
                event_type="pr_open_org",
                repo=pr.get("repository_url", "").split("/")[-1],
                detail=pr.get("title", ""),
                content_excerpt=(pr.get("body") or "")[:200],
            ))
    
    # Sort by timestamp
    events.sort(key=lambda e: e.timestamp)
    return events[-limit:]


def fetch_canon_at_time(timestamp: int, window_hours: int = 1) -> list[dict]:
    """Fetch canon cells recorded within ±window_hours of timestamp (horizontal context)."""
    req = urllib.request.Request(
        f"{SUBSTRATE_URL}/api/cells?limit=50",
        headers={"User-Agent": "maker-animator/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        cells = data.get("cells", [])
        # Filter to window
        target = timestamp
        window_sec = window_hours * 3600
        return [c for c in cells if abs(c.get("timestamp", 0) / 1000 - target) < window_sec]
    except Exception:
        return []


def animate(handle: str, format: str = "ascii") -> str:
    """Animate a maker's trajectory."""
    events = fetch_maker_trajectory(handle, limit=80)
    if not events:
        return f"No events found for {handle}"
    
    if format == "ascii":
        return _animate_ascii(handle, events)
    elif format == "json":
        return json.dumps([asdict(e) for e in events], indent=2)
    elif format == "synopsis":
        return _animate_synopsis(handle, events)
    return _animate_ascii(handle, events)


def _animate_ascii(handle: str, events: list[MakerEvent]) -> str:
    """ASCII timeline view: vertical = time, horizontal = concurrent events."""
    if not events:
        return f"No activity for {handle}"
    
    out = [f"# Maker Animation: @{handle}"]
    out.append(f"# {len(events)} events captured")
    out.append(f"# Vertical: time  |  Horizontal: events at each timestamp")
    out.append("")
    
    # Group by date
    by_day: dict[str, list[MakerEvent]] = {}
    for e in events:
        day = datetime.fromtimestamp(e.timestamp, tz=timezone.utc).strftime("%Y-%m-%d")
        by_day.setdefault(day, []).append(e)
    
    for day in sorted(by_day.keys()):
        evs = by_day[day]
        out.append(f"## {day}  ({len(evs)} events)")
        # Vertical time markers
        for e in evs:
            t = datetime.fromtimestamp(e.timestamp, tz=timezone.utc).strftime("%H:%M")
            etype = e.event_type[:14].ljust(14)
            repo = e.repo.split("/")[-1][:24].ljust(24)
            detail = (e.detail or "")[:50].replace("\n", " ")
            out.append(f"  {t}  {etype}  {repo}  {detail}")
        out.append("")


def _animate_synopsis(handle: str, events: list[MakerEvent]) -> str:
    """Produce a textual synopsis suitable for embedding/JEV."""
    by_repo: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for e in events:
        by_repo[e.repo] = by_repo.get(e.repo, 0) + 1
        by_type[e.event_type] = by_type.get(e.event_type, 0) + 1
    
    lines = [
        f"Maker: @{handle}",
        f"Events: {len(events)}",
        f"Time span: {datetime.fromtimestamp(events[0].timestamp, tz=timezone.utc).isoformat()[:10]} "
        f"to {datetime.fromtimestamp(events[-1].timestamp, tz=timezone.utc).isoformat()[:10]}",
        f"",
        f"Top repos:",
    ]
    for r, c in sorted(by_repo.items(), key=lambda x: -x[1])[:10]:
        lines.append(f"  {r}: {c}")
    lines.append("")
    lines.append(f"Event types:")
    for t, c in sorted(by_type.items(), key=lambda x: -x[1]):
        lines.append(f"  {t}: {c}")
    lines.append("")
    lines.append(f"Trajectory (last 10):")
    for e in events[-10:]:
        t = datetime.fromtimestamp(e.timestamp, tz=timezone.utc).isoformat()[:19]
        lines.append(f"  {t}  {e.event_type}  {e.repo}  {e.detail[:60]}")
    
    return "\n".join(lines)


if __name__ == "__main__":
    handle = sys.argv[1] if len(sys.argv) > 1 else "Casey"
    fmt = sys.argv[2] if len(sys.argv) > 2 else "ascii"
    
    print(animate(handle, fmt))
