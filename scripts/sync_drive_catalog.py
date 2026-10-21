from pathlib import Path
from urllib.request import Request, urlopen
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".source"

DRIVE_FILES = {
    "camera.xlsx": "1jHuMsA9IgwHRnoDAYgFhrKZOjRa7Q45R",
    "light.xlsx": "1_vsaDRDfVurHqjusgp0WVVFY6wDkvbkK",
    "sound.xlsx": "1pcF7BJXhNt_YbHf3V6J0ZpedgJ6h2Tc1",
    "production.xlsx": "1e_R-xXwkURkzvUkh72bdecb5Q2sc7oM2",
    "rental.xlsx": "1RnUWQZCdlnu7U0Sy5o7-Kb7u34azfsnZ",
}


def download(file_id: str, destination: Path) -> None:
    url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"
    request = Request(url, headers={"User-Agent": "KIMUN-Catalog-Sync/1.0"})
    with urlopen(request, timeout=60) as response:
        data = response.read()

    temporary = destination.with_suffix(".tmp")
    temporary.write_bytes(data)
    try:
        with ZipFile(temporary) as workbook:
            if "xl/workbook.xml" not in workbook.namelist():
                raise RuntimeError(f"{destination.name} no es un archivo Excel válido")
    except BadZipFile as error:
        raise RuntimeError(f"Drive no devolvió un Excel válido para {destination.name}") from error

    temporary.replace(destination)
    print(f"{destination.name}: {len(data)} bytes")


SOURCE.mkdir(parents=True, exist_ok=True)
for filename, drive_id in DRIVE_FILES.items():
    download(drive_id, SOURCE / filename)

