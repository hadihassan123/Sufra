#!/usr/bin/env python3
"""Validate render.yaml parses and matches Sufra's expected static-site shape.

Does not call the Render API — only guards the file in git so a bad edit
cannot merge unnoticed. Run from repo root: python3 scripts/check-render-yaml.py
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML is required: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "render.yaml"


def main() -> int:
    if not PATH.is_file():
        print(f"FAIL: {PATH} is missing")
        return 1

    try:
        data = yaml.safe_load(PATH.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        print(f"FAIL: render.yaml is not valid YAML:\n{e}")
        return 1

    if not isinstance(data, dict):
        print("FAIL: render.yaml root must be a mapping")
        return 1

    services = data.get("services")
    if not isinstance(services, list) or len(services) < 1:
        print("FAIL: render.yaml must define a non-empty services list")
        return 1

    svc = services[0]
    if not isinstance(svc, dict):
        print("FAIL: services[0] must be a mapping")
        return 1

    errors: list[str] = []
    if svc.get("type") != "web":
        errors.append(f"services[0].type must be 'web' (got {svc.get('type')!r})")
    if svc.get("runtime") != "static":
        errors.append(f"services[0].runtime must be 'static' (got {svc.get('runtime')!r})")
    if svc.get("staticPublishPath") is None:
        errors.append("services[0].staticPublishPath is required")
    if not svc.get("name"):
        errors.append("services[0].name is required")

    headers = svc.get("headers") or []
    if not isinstance(headers, list) or len(headers) < 1:
        errors.append("services[0].headers must be a non-empty list")
    else:
        csp = [
            h for h in headers
            if isinstance(h, dict)
            and h.get("name") == "Content-Security-Policy"
            and h.get("value")
        ]
        if not csp:
            errors.append(
                "services[0].headers must include a Content-Security-Policy entry with a value"
            )

    if errors:
        print("FAIL: render.yaml shape check:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print("OK: render.yaml parses and matches expected static-site + CSP shape")
    return 0


if __name__ == "__main__":
    sys.exit(main())
