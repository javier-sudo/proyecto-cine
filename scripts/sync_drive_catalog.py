import json
import re
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "dist" / "config.js"
OUTPUT = ROOT / "dist" / "catalog-data.js"
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_PRODUCTS = 5000
ALLOWED_PRODUCT_FIELDS = {"id", "name", "brand", "detail", "availability", "mode", "category"}
FORBIDDEN_FIELDS = {"price", "cost", "margin", "supplier"}


def api_url() -> str:
    match = re.search(r'apiUrl:\s*["\']([^"\']+)["\']', CONFIG.read_text(encoding="utf-8"))
    if not match:
        raise RuntimeError("No se encontró apiUrl en dist/config.js")
    url = match.group(1)
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "script.google.com" or not re.fullmatch(r"/macros/s/[A-Za-z0-9_-]+/exec", parsed.path):
        raise RuntimeError("La URL del catálogo no es un despliegue Apps Script permitido")
    return url


def fetch_catalog(url: str) -> dict:
    request = Request(url, headers={"User-Agent": "KIMUN-Catalog-Sync/2.0", "Accept": "application/json"})
    with urlopen(request, timeout=60) as response:
        final = urlparse(response.geturl())
        if final.scheme != "https" or final.hostname not in {"script.google.com", "script.googleusercontent.com"}:
            raise RuntimeError("Apps Script redirigió a un host no permitido")
        data = response.read(MAX_RESPONSE_BYTES + 1)
    if len(data) > MAX_RESPONSE_BYTES:
        raise RuntimeError("La respuesta del catálogo excede el tamaño permitido")
    payload = json.loads(data.decode("utf-8"))
    if not isinstance(payload, dict) or payload.get("success") is not True or not isinstance(payload.get("catalog"), dict):
        raise RuntimeError("Apps Script no devolvió un catálogo válido")
    return payload["catalog"]


def validate_catalog(catalog: dict) -> None:
    if set(catalog) != {"sale", "rental"}:
        raise RuntimeError("El catálogo contiene secciones inesperadas")
    product_count = 0
    for mode in ("sale", "rental"):
        section = catalog[mode]
        if not isinstance(section, dict) or not isinstance(section.get("categories"), list):
            raise RuntimeError(f"La sección {mode} no es válida")
        for category in section["categories"]:
            if not isinstance(category, dict) or set(category) - {"name", "products"} or not isinstance(category.get("name"), str) or not isinstance(category.get("products"), list):
                raise RuntimeError("Una categoría contiene campos inesperados")
            for product in category["products"]:
                product_count += 1
                if product_count > MAX_PRODUCTS:
                    raise RuntimeError("El catálogo excede el máximo de productos")
                if not isinstance(product, dict) or not isinstance(product.get("id"), str) or not isinstance(product.get("name"), str):
                    raise RuntimeError("Un producto no tiene el formato esperado")
                fields = {str(key).lower() for key in product}
                if fields & FORBIDDEN_FIELDS or set(product) - ALLOWED_PRODUCT_FIELDS:
                    raise RuntimeError("Un producto contiene campos no públicos")
                if any(not isinstance(value, str) for value in product.values()):
                    raise RuntimeError("Los valores de producto deben ser texto")


def write_catalog(catalog: dict) -> None:
    content = "window.KIMUN_CATALOG = " + json.dumps(catalog, ensure_ascii=False, indent=2) + ";\n"
    with NamedTemporaryFile("w", encoding="utf-8", newline="\n", dir=OUTPUT.parent, delete=False) as temporary:
        temporary.write(content)
        temporary_path = Path(temporary.name)
    temporary_path.replace(OUTPUT)


if __name__ == "__main__":
    catalog = fetch_catalog(api_url())
    validate_catalog(catalog)
    write_catalog(catalog)
    print(f"Catálogo sanitizado: {OUTPUT.stat().st_size} bytes")
