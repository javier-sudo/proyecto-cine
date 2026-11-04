import json
import re
import socket
import time
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "dist" / "config.js"
OUTPUT = ROOT / "dist" / "catalog-data.js"
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_PRODUCTS = 5000
FETCH_ATTEMPTS = 3
FETCH_TIMEOUT_SECONDS = 90
RETRY_DELAYS_SECONDS = (10, 25)
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


def fetch_catalog_once(url: str) -> dict:
    request = Request(url, headers={"User-Agent": "KIMUN-Catalog-Sync/2.0", "Accept": "application/json"})
    with urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
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


def is_transient(error: BaseException) -> bool:
    if isinstance(error, HTTPError):
        return error.code == 429 or 500 <= error.code < 600
    return isinstance(error, (TimeoutError, socket.timeout, URLError))


def fetch_catalog(url: str) -> dict:
    for attempt in range(1, FETCH_ATTEMPTS + 1):
        try:
            return fetch_catalog_once(url)
        except Exception as error:
            if not is_transient(error) or attempt == FETCH_ATTEMPTS:
                raise
            delay = RETRY_DELAYS_SECONDS[attempt - 1]
            print(
                f"Aviso: Apps Script no respondió en el intento {attempt}/{FETCH_ATTEMPTS} "
                f"({type(error).__name__}). Reintento en {delay}s.",
                flush=True,
            )
            time.sleep(delay)


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


def normalized(value: str) -> str:
    import unicodedata

    plain = "".join(character for character in unicodedata.normalize("NFD", value.lower()) if unicodedata.category(character) != "Mn")
    return re.sub(r"\s+", " ", plain).strip()


def should_publish(product: dict) -> bool:
    name = normalized(product.get("name", ""))
    detail = normalized(product.get("detail", ""))
    hidden = (
        ("gaffer" in name and "25 metros" in detail)
        or "despacho" in name
        or "lentilla de contraste" in name
        or (name == "alambre 18" and "1 kilo" in detail)
        or "masking 3 tradicional" in name
        or "cubre zapatos negros" in name
        or "linterna cuello" in name
        or "destornillador camara" in name
        or "liquido hazer" in name
        or "liquido humo" in name
    )
    return not hidden


def filter_catalog(catalog: dict) -> dict:
    for mode in ("sale", "rental"):
        for category in catalog[mode]["categories"]:
            category["products"] = [product for product in category["products"] if should_publish(product)]
    return catalog


def write_catalog(catalog: dict) -> None:
    content = "window.KIMUN_CATALOG = " + json.dumps(catalog, ensure_ascii=False, indent=2) + ";\n"
    with NamedTemporaryFile("w", encoding="utf-8", newline="\n", dir=OUTPUT.parent, delete=False) as temporary:
        temporary.write(content)
        temporary_path = Path(temporary.name)
    temporary_path.replace(OUTPUT)


if __name__ == "__main__":
    try:
        catalog = fetch_catalog(api_url())
        validate_catalog(catalog)
        catalog = filter_catalog(catalog)
        write_catalog(catalog)
        print(f"Catálogo sanitizado: {OUTPUT.stat().st_size} bytes")
    except Exception as error:
        if not is_transient(error):
            raise
        if not OUTPUT.is_file() or OUTPUT.stat().st_size == 0:
            raise
        print(
            "Aviso: Google no respondió después de los reintentos. "
            "Se conserva el último catálogo público válido; el próximo ciclo volverá a intentar. "
            f"Detalle: {type(error).__name__}: {error}",
            flush=True,
        )
