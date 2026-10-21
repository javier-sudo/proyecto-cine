# KIMUN Cine

Catálogo web de venta de insumos y rental para cine y producción audiovisual. La versión publicada contiene 203 productos y 74 equipos, separados por área, con búsqueda, filtros y solicitud de cotización por WhatsApp.

## Catálogo actual

Los datos se generan desde las cinco planillas entregadas por KIMUN: cámara, iluminación, sonido, producción y rental. La carpeta oficial de Drive es `1TEo8DNmT0vXpgZIKg-fnn6ADLvHusOUo`.

El sitio consulta un Apps Script público de solo lectura al abrir la página. El servicio lee en paralelo las cinco planillas Excel originales por sus IDs estables, por lo que los cambios aparecen al recargar el sitio. `dist/catalog-data.js` queda como respaldo si Drive o la red no están disponibles.

El workflow `.github/workflows/sync-drive-catalog.yml` mantiene ese respaldo actualizado: reconstruye `dist/catalog-data.js` y publica GitHub Pages cuando detecta cambios. Se ejecuta cada 15 minutos y también puede iniciarse manualmente desde GitHub Actions.

Para reconstruirlo localmente, ejecuta primero `python scripts/sync_drive_catalog.py` y luego `python scripts/build_catalog.py`. Requiere `openpyxl`.

Por ahora las tarjetas no muestran fotografías de productos. El único recurso gráfico usado es el logo oficial de KIMUN.

## Estructura del catálogo

Los cuatro Excel de venta generan las áreas Cámara, Iluminación, Sonido y Producción. El Excel de rental conserva sus secciones HMI, Tungsteno, LED, Tubos, Otros y Accesorios. El lector usa producto, marca, detalle y disponibilidad; los precios y las imágenes de producto no se publican.

## Conexión

1. Copia `apps-script/Codigo.gs` y `apps-script/appsscript.json` en un proyecto Apps Script autorizado para leer los Excel.
2. Implementa como aplicación web, ejecutando como propietario, con acceso para cualquier persona que tenga el enlace.
3. Copia la URL terminada en `/exec` dentro de `dist/config.js`.
4. Cambia el número de WhatsApp en `dist/config.js` si corresponde.

El sitio usa `dist/catalog-data.js` mientras `apiUrl` esté vacío. Ninguna contraseña debe guardarse en los archivos públicos.
