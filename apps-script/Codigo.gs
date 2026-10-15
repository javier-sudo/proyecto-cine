/**
 * API pública de solo lectura para el catálogo KIMUN.
 * Cada pestaña válida de la hoja se convierte en una categoría.
 * Solo se publican pestañas que contienen una columna de producto y una de precio.
 */
const SPREADSHEET_ID = '1BGj5Y0sPrw-6lbCzhuuXkTIg5Kz2EdyafjKwJQbw3oo';
const DRIVE_FOLDER_ID = '142IxQzU1sLMcDswBiU9MMkXRrTOalfzf';
const CACHE_SECONDS = 300;
const EXCLUDED_SHEETS = ['configuracion', 'usuarios', 'clases', 'entrega_proyectos', 'proyectos', 'logs'];

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'catalog').toLowerCase();
    if (action === 'health') return json_({ success: true, service: 'kimun-catalog', timestamp: new Date().toISOString() });
    if (action !== 'catalog') return json_({ success: false, message: 'Acción no disponible.' });
    return json_(getCatalog_());
  } catch (error) {
    console.error(error);
    return json_({ success: false, message: 'No fue posible cargar el catálogo.' });
  }
}

function getCatalog_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('catalog-v1');
  if (cached) return JSON.parse(cached);

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const categories = spreadsheet.getSheets()
    .filter(sheet => !isExcludedSheet_(sheet.getName()))
    .map(sheetToCategory_)
    .filter(category => category && category.products.length);

  const result = {
    success: true,
    updatedAt: new Date().toISOString(),
    categories: categories
  };
  cache.put('catalog-v1', JSON.stringify(result), CACHE_SECONDS);
  return result;
}

function sheetToCategory_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return null;
  const header = findHeader_(values);
  if (!header) return null;

  const products = [];
  for (let rowIndex = header.row + 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    const name = cell_(row, header.columns.name);
    const rawPrice = cell_(row, header.columns.price);
    if (!name || !rawPrice) continue;
    const active = normalize_(cell_(row, header.columns.active));
    if (['no', 'false', '0', 'inactivo'].indexOf(active) >= 0) continue;
    const price = parsePrice_(rawPrice);
    if (!isFinite(price) || price < 0) continue;

    const imageValue = cell_(row, header.columns.image);
    products.push({
      id: cell_(row, header.columns.id) || slug_(sheet.getName() + '-' + name + '-' + rowIndex),
      name: name,
      price: price,
      brand: cell_(row, header.columns.brand),
      detail: cell_(row, header.columns.detail),
      stock: cell_(row, header.columns.stock),
      image: resolveImage_(imageValue)
    });
  }
  return { name: cleanCategoryName_(sheet.getName()), products: products };
}

function findHeader_(values) {
  const maxRows = Math.min(values.length, 15);
  for (let row = 0; row < maxRows; row++) {
    const normalized = values[row].map(normalize_);
    const columns = {
      id: findColumn_(normalized, ['id', 'sku', 'codigo', 'cod']),
      name: findColumn_(normalized, ['producto', 'nombre', 'insumo', 'item', 'articulo', 'descripcion producto']),
      price: findColumn_(normalized, ['precio', 'valor', 'precio venta', 'venta', 'precio clp']),
      brand: findColumn_(normalized, ['marca', 'fabricante']),
      detail: findColumn_(normalized, ['detalle', 'descripcion', 'presentacion', 'formato']),
      stock: findColumn_(normalized, ['stock', 'disponible', 'cantidad disponible']),
      image: findColumn_(normalized, ['imagen', 'foto', 'url imagen', 'archivo imagen']),
      active: findColumn_(normalized, ['activo', 'publicar', 'visible', 'estado'])
    };
    if (columns.name >= 0 && columns.price >= 0) return { row: row, columns: columns };
  }
  return null;
}

function resolveImage_(value) {
  if (!value) return '';
  const directId = extractDriveId_(value);
  if (directId) return 'https://drive.google.com/thumbnail?id=' + directId + '&sz=w1000';
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const files = DriveApp.getFolderById(DRIVE_FOLDER_ID).getFilesByName(value);
    if (files.hasNext()) return 'https://drive.google.com/thumbnail?id=' + files.next().getId() + '&sz=w1000';
  } catch (error) {
    console.warn('Imagen no encontrada: ' + value);
  }
  return '';
}

function extractDriveId_(value) {
  const text = String(value).trim();
  const rawId = text.match(/^[-\w]{20,}$/);
  if (rawId) return rawId[0];
  if (!/(?:drive|docs)\.google\.com/i.test(text)) return '';
  const match = text.match(/(?:\/d\/|[?&]id=)([-\w]{20,})/);
  return match ? match[1] : '';
}

function findColumn_(headers, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const index = headers.indexOf(normalize_(aliases[i]));
    if (index >= 0) return index;
  }
  return -1;
}

function cell_(row, index) { return index >= 0 ? String(row[index] || '').trim() : ''; }
function normalize_(value) { return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function parsePrice_(value) { return Number(String(value).replace(/[^0-9,-]/g, '').replace(/\./g, '').replace(',', '.')); }
function slug_(value) { return normalize_(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function cleanCategoryName_(value) { return String(value).replace(/^CAT[_ -]*/i, '').trim(); }
function isExcludedSheet_(name) { const key = normalize_(name); return key.charAt(0) === '_' || EXCLUDED_SHEETS.indexOf(key) >= 0; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

function clearCatalogCache() {
  CacheService.getScriptCache().remove('catalog-v1');
}
