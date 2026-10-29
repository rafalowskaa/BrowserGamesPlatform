#!/usr/bin/env python3
"""Check repository metadata and references without running the application."""
from pathlib import Path
import json
import re
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "Bgp.Web" / "wwwroot"
errors = []
checked = 0


def excluded(path):
    parts = path.relative_to(ROOT).parts
    return (
        any(part in {".git", "bin", "obj", "node_modules", "TestResults"} for part in parts)
        or "lib" in parts and "wwwroot" in parts
    )


def fail(path, message):
    errors.append(f"{path.relative_to(ROOT)}: {message}")


for path in ROOT.rglob("*"):
    if not path.is_file() or excluded(path):
        continue
    relative = path.relative_to(ROOT)
    if path.suffix.lower() == ".json":
        checked += 1
        try:
            json.loads(path.read_text(encoding="utf-8-sig"))
        except (ValueError, UnicodeError) as exc:
            fail(path, f"invalid JSON ({exc})")

    if path.suffix.lower() == ".md" or path.name.upper().startswith(("LICENSE", "COPYING")):
        checked += 1
        text = path.read_text(encoding="utf-8-sig")
        if re.search(r"\[(?:year|fullname|your name)\]|<YEAR>|<COPYRIGHT HOLDER>", text, re.I):
            fail(path, "unfilled author/copyright placeholder")
        if path.suffix.lower() == ".md":
            for match in re.finditer(r"!?\[[^\]]*\]\(([^)\n]+)\)", text):
                target = match.group(1).strip().strip("<>").split(' "')[0]
                if target.startswith("#") or re.match(r"[a-z][a-z0-9+.-]*:", target, re.I):
                    continue
                target = unquote(target.split("#")[0].split("?")[0])
                if target and not (path.parent / target).exists():
                    fail(path, f"missing Markdown target: {target}")

    if path.suffix.lower() == ".css" and "games" not in relative.parts:
        checked += 1
        text = path.read_text(encoding="utf-8-sig")
        for match in re.finditer(r"url\(\s*['\"]?([^)'\"\s]+)['\"]?\s*\)", text):
            target = match.group(1)
            if target.startswith(("#", "//")) or re.match(r"[a-z][a-z0-9+.-]*:", target, re.I):
                continue
            target = unquote(target.split("#")[0].split("?")[0])
            destination = WEB_ROOT / target.lstrip("/") if target.startswith("/") else path.parent / target
            if target and not destination.exists():
                fail(path, f"missing CSS asset: {target}")

    if path.suffix.lower() == ".cs" and "Bgp.Tests" in relative.parts:
        checked += 1
        if re.search(r"Assert\.True\s*\(\s*true\s*\)", path.read_text(encoding="utf-8-sig")):
            fail(path, "test contains an assertion that always passes")

if errors:
    print("\n".join(errors), file=sys.stderr)
    sys.exit(1)
print(f"Repository checks passed ({checked} files checked).")
