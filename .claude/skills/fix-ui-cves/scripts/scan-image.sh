#!/usr/bin/env bash
# scan-image.sh: scan a built container image for OS *and* application CVEs.
#
# Usage: bash scan-image.sh <IMAGE_REF>
#
# scan-dockerfile.sh only looks at the base image named in the FROM line. This
# scans a real built (or pulled) image, so it also covers the application
# dependencies that were installed into it — the layer that actually ships.
#
# Runs both scanners on purpose. Measured against a released Backstage backend
# image, `snyk container test` reported 1 low, while trivy found 2 critical and
# 4 high *fixable* OS issues plus 29 critical and 175 high fixable Node
# dependencies. Snyk did not report the Node application layer at all, even
# with --app-vulns. Treat trivy as the primary signal here and Snyk as a
# cross-check, not the other way round.
set -e

IMAGE="$1"
[[ -z "$IMAGE" ]] && { echo "Usage: scan-image.sh <IMAGE_REF>"; exit 1; }

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "=== image not present locally, pulling: $IMAGE"
  docker pull "$IMAGE" >/dev/null 2>&1 || {
    echo "ERROR: could not pull $IMAGE" >&2
    exit 1
  }
fi

echo "=== image: $IMAGE"
docker run --rm --entrypoint sh "$IMAGE" -c \
  'grep -m1 PRETTY_NAME /etc/os-release 2>/dev/null; node --version 2>/dev/null' \
  2>/dev/null | sed 's/^/    /' || true
echo

TRIVY_JSON=$(mktemp)
trap 'rm -f "$TRIVY_JSON"' EXIT

echo "=== trivy (OS packages + application dependencies) ==="
trivy image "$IMAGE" --scanners vuln --format json -q >"$TRIVY_JSON" 2>/dev/null || {
  echo "ERROR: trivy failed" >&2
  exit 1
}

python3 - "$TRIVY_JSON" <<'PY'
import json, sys, collections

data = json.load(open(sys.argv[1]))
grand = collections.Counter()
grand_fixable = collections.Counter()

for result in data.get('Results') or []:
    vulns = result.get('Vulnerabilities') or []
    if not vulns:
        continue
    fixable = [v for v in vulns if v.get('FixedVersion')]
    sev = collections.Counter(v['Severity'] for v in vulns)
    sev_fix = collections.Counter(v['Severity'] for v in fixable)
    grand.update(sev)
    grand_fixable.update(sev_fix)
    print(f"  layer: {result.get('Type')}  ({result.get('Target','')[:60]})")
    print(f"    all:     {len(vulns):5}  {dict(sev)}")
    print(f"    fixable: {len(fixable):5}  {dict(sev_fix)}")

print()
print(f"  TOTAL all:     {sum(grand.values()):5}  {dict(grand)}")
print(f"  TOTAL fixable: {sum(grand_fixable.values()):5}  {dict(grand_fixable)}")

# Only fixable findings are actionable; unfixed distro CVEs cannot be
# remediated from this repo and should be reported, not chased.
blocking = grand_fixable['CRITICAL'] + grand_fixable['HIGH']
print()
print(f"  FIXABLE CRITICAL+HIGH (these block): {blocking}")
PY

echo
echo "=== snyk container test (cross-check) ==="
if snyk container test "$IMAGE" --app-vulns --json >/tmp/_snyk_img.json 2>/dev/null || [[ -s /tmp/_snyk_img.json ]]; then
  python3 - /tmp/_snyk_img.json <<'PY'
import json, sys, collections
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    print("  (no parsable Snyk output — is `snyk auth` done?)")
    raise SystemExit
if isinstance(data, dict) and data.get('error'):
    print(f"  Snyk error: {data['error']}")
    raise SystemExit
projs = data if isinstance(data, list) else [data]
total = collections.Counter()
for p in projs:
    vs = {(v['packageName'], v.get('version'), v.get('id')): v
          for v in (p.get('vulnerabilities') or [])}
    sev = collections.Counter(v.get('severity') for v in vs.values())
    total.update(sev)
    print(f"  {str(p.get('packageManager')):10} {len(vs):5} {dict(sev)}")
print(f"  TOTAL: {dict(total) or 'none reported'}")
print("  NOTE: Snyk has been observed to omit the Node application layer for")
print("        these images. A clean result here does not mean the image is clean.")
PY
  rm -f /tmp/_snyk_img.json
else
  echo "  (snyk unavailable or not authenticated — run 'snyk auth'; trivy result above still applies)"
fi
