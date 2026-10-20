# KIMUN Cine

Catálogo web de venta de insumos y rental para cine y producción audiovisual. La versión publicada contiene 203 productos y 74 equipos, separados por área, con búsqueda, filtros y solicitud de cotización por WhatsApp.

## Catálogo actual

Los datos se generan desde las cinco planillas entregadas por KIMUN: cámara, iluminación, sonido, producción y rental. Para reconstruir `dist/catalog-data.js`, deja los archivos fuente en `.source/` con los nombres usados por `scripts/build_catalog.py` y ejecuta el script con Python y `openpyxl`.

Por ahora las tarjetas no muestran fotografías de productos. El único recurso gráfico usado es el logo oficial de KIMUN.

## Estructura de las pestañas de catálogo

Cada pestaña válida de la hoja se transforma en una categoría. El script detecta encabezados dentro de las primeras 15 filas y exige dos columnas:

- `Producto`, `Nombre`, `Insumo`, `Item` o `Artículo`
- `Precio` o `Valor`

Columnas opcionales: `ID`, `Marca`, `Detalle`, `Stock`, `Imagen` y `Activo`.

Para excluir una pestaña, antepone `_` a su nombre. El script también excluye por defecto hojas internas como `Usuarios`, `Configuracion`, `Clases`, `Entrega_Proyectos`, `Proyectos` y `Logs`.

En `Imagen` se puede usar cualquiera de estas opciones:

- Una URL pública directa de imagen (`https://...jpg`, `.png`, `.webp`, etc.). Para Mercado Libre u otra tienda se debe copiar la dirección de la foto, no la URL de la publicación.
- Un enlace compartido o el ID de un archivo de Google Drive.
- El nombre exacto de una imagen subida a la carpeta `imagenes-productos` de Drive.

Las tiendas externas pueden bloquear la carga o cambiar sus URLs. Por eso, para un catálogo estable se recomienda subir la imagen a Drive. Si una imagen no carga, la tarjeta conserva automáticamente su respaldo gráfico.

## Conexión

1. Copia `apps-script/Codigo.gs` y `apps-script/appsscript.json` en el proyecto Apps Script asociado a la hoja.
2. Implementa como aplicación web, ejecutando como propietario, con acceso para cualquier persona que tenga el enlace.
3. Copia la URL terminada en `/exec` dentro de `dist/config.js`.
4. Cambia el número de WhatsApp en `dist/config.js` si corresponde.

El sitio usa `dist/catalog-data.js` mientras `apiUrl` esté vacío. Ninguna contraseña debe guardarse en los archivos públicos.
