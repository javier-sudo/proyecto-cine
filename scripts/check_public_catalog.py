import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
FORBIDDEN_FILE = DIST / "catalog-fallback.js"
FORBIDDEN_KEY = re.compile(r'["\'](?:price|cost|margin|supplier)["\']\s*:', re.IGNORECASE)


if FORBIDDEN_FILE.exists():
    raise SystemExit("No se puede publicar dist/catalog-fallback.js")

violations = []
for path in DIST.rglob("*"):
    if path.is_file() and path.suffix.lower() in {".js", ".json"}:
        if FORBIDDEN_KEY.search(path.read_text(encoding="utf-8")):
            violations.append(str(path.relative_to(ROOT)))

if violations:
    raise SystemExit("Campos comerciales no públicos detectados en: " + ", ".join(violations))

print("Salida pública validada: no contiene campos comerciales prohibidos.")
