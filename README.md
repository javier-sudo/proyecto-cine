# KIMUN Cine

Catálogo web de venta de insumos y rental para cine y producción audiovisual. La versión publicada contiene 203 productos y 74 equipos, separados por área, con búsqueda, filtros y solicitud de cotización por WhatsApp.

## Catálogo actual

Los datos se generan desde las cinco planillas entregadas por KIMUN: cámara, iluminación, sonido, producción y rental. La carpeta oficial de Drive es `1TEo8DNmT0vXpgZIKg-fnn6ADLvHusOUo`.

El sitio consulta un Apps Script público de solo lectura al abrir la página. El servicio usa la autorización del propietario para leer las cinco planillas privadas, mantiene una caché de 15 minutos y solo devuelve los campos públicos del catálogo. Si una actualización falla, conserva temporalmente el último resultado válido. `dist/catalog-data.js` queda como respaldo si Drive o la red no están disponibles.

El workflow `.github/workflows/sync-drive-catalog.yml` mantiene ese respaldo actualizado desde la respuesta sanitizada de Apps Script y publica GitHub Pages cuando detecta cambios. No descarga los Excel completos. Se ejecuta cada 15 minutos y también puede iniciarse manualmente desde GitHub Actions.

Para reconstruirlo localmente, ejecuta `python scripts/sync_drive_catalog.py`. No requiere paquetes externos.

Por ahora las tarjetas no muestran fotografías de productos. El único recurso gráfico usado es el logo oficial de KIMUN.

## Estructura del catálogo

Los cuatro Excel de venta generan las áreas Cámara, Iluminación, Sonido y Producción. El Excel de rental conserva sus secciones HMI, Tungsteno, LED, Tubos, Otros y Accesorios. El lector usa producto, marca, detalle y disponibilidad; los precios y las imágenes de producto no se publican.

## Conexión

1. Mantén los cinco Excel con acceso **Restringido** en Drive; no uses “cualquier persona con el enlace”.
2. Copia `apps-script/Codigo.gs` y `apps-script/appsscript.json` en un proyecto Apps Script del propietario autorizado para leerlos.
3. Implementa como aplicación web, ejecutando como propietario, con acceso de lectura público únicamente a la respuesta sanitizada.
4. Copia la URL terminada en `/exec` dentro de `dist/config.js`.
5. Cambia el número de WhatsApp en `dist/config.js` si corresponde.

Antes de publicar, `python scripts/check_public_catalog.py` verifica que no existan precios, costos, márgenes ni proveedores en `dist`.

El sitio usa `dist/catalog-data.js` mientras `apiUrl` esté vacío. Ninguna contraseña debe guardarse en los archivos públicos.
