/**
 * API pública de solo lectura para KIMUN.
 * Los Excel pueden permanecer privados: el despliegue los lee con la
 * autorización del propietario y solo publica el catálogo sanitizado.
 */
const DRIVE_FILES = {
  camera: '1jHuMsA9IgwHRnoDAYgFhrKZOjRa7Q45R',
  light: '1_vsaDRDfVurHqjusgp0WVVFY6wDkvbkK',
  sound: '1pcF7BJXhNt_YbHf3V6J0ZpedgJ6h2Tc1',
  production: '1e_R-xXwkURkzvUkh72bdecb5Q2sc7oM2',
  rental: '1RnUWQZCdlnu7U0Sy5o7-Kb7u34azfsnZ'
};

const CACHE_KEY = 'kimun-catalog-v2';
const STALE_CACHE_KEY = 'kimun-catalog-v2-stale';
const CACHE_SECONDS = 900;
const STALE_CACHE_SECONDS = 21600;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 128;
const MAX_EXPANDED_BYTES = 32 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 100;
const MAX_CELLS = 100000;
const MAX_CALLBACK_LENGTH = 128;

function doGet(e) {
  const callback = String((e && e.parameter && e.parameter.callback) || '');
  try {
    return output_(catalogPayload_(), callback);
  } catch (error) {
    console.error(error);
    return output_({ success: false, message: 'No fue posible leer el catálogo.' }, callback);
  }
}

function catalogPayload_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    const stale = cache.get(STALE_CACHE_KEY);
    if (stale) return JSON.parse(stale);
    throw new Error('La actualización del catálogo ya está en curso.');
  }

  try {
    const secondRead = cache.get(CACHE_KEY);
    if (secondRead) return JSON.parse(secondRead);
    try {
      const payload = { success: true, updatedAt: new Date().toISOString(), catalog: buildCatalog_() };
      const serialized = JSON.stringify(payload);
      if (Utilities.newBlob(serialized).getBytes().length > 95000) throw new Error('El catálogo excede el tamaño seguro de caché.');
      cache.put(CACHE_KEY, serialized, CACHE_SECONDS);
      cache.put(STALE_CACHE_KEY, serialized, STALE_CACHE_SECONDS);
      return payload;
    } catch (error) {
      const stale = cache.get(STALE_CACHE_KEY);
      if (stale) return JSON.parse(stale);
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

function buildCatalog_() {
  const rows = downloadRows_();
  return {
    sale: { label: 'Venta', categories: [
      saleCategory_(rows.camera, 'Cámara', 'cam'),
      saleCategory_(rows.light, 'Iluminación', 'ilu'),
      saleCategory_(rows.sound, 'Sonido', 'son'),
      saleCategory_(rows.production, 'Producción', 'pro')
    ] },
    rental: { label: 'Rental', categories: rentalCategories_(rows.rental) }
  };
}

function downloadRows_() {
  const rows = {};
  Object.keys(DRIVE_FILES).forEach(function (key) {
    const file = DriveApp.getFileById(DRIVE_FILES[key]);
    const size = Number(file.getSize());
    if (!size || size > MAX_FILE_BYTES) throw new Error('Tamaño de archivo no permitido para ' + key + '.');
    rows[key] = xlsxRows_(file.getBlob());
  });
  return rows;
}

function saleCategory_(rows, label, prefix) {
  const products = [];
  rows.forEach(function (row) {
    const name = clean_(row[1]);
    const lowered = normalize_(name);
    if (!name || lowered === 'kimun spa' || startsWithAny_(lowered, ['insumos', 'total', 'iva', 'contacto'])) return;
    if (products.length >= MAX_ROWS) throw new Error('Demasiados productos en ' + label + '.');
    products.push({ id: prefix + '-' + pad_(products.length + 1), name: name, brand: clean_(row[3]), detail: clean_(row[4]), mode: 'Venta', category: label });
  });
  return { name: label, products: products };
}

function rentalCategories_(rows) {
  const names = { HMI: 'HMI', TUNGTENO: 'Tungsteno', LED: 'LED', TUBOS: 'Tubos', OTROS: 'Otros', ACCESORIOS: 'Accesorios' };
  const grouped = { HMI: [], Tungsteno: [], LED: [], Tubos: [], Otros: [], Accesorios: [] };
  let section = 'Otros';
  let productCount = 0;
  rows.forEach(function (row) {
    const name = clean_(row[1]);
    if (!name) return;
    const upper = name.toUpperCase();
    if (names[upper]) { section = names[upper]; return; }
    const lowered = normalize_(name);
    if (startsWithAny_(lowered, ['total', 'iva', 'contacto', 'kimuntecnica'])) return;
    productCount += 1;
    if (productCount > MAX_ROWS) throw new Error('Demasiados equipos de arriendo.');
    const products = grouped[section];
    products.push({ id: 'ren-' + section.slice(0, 3).toLowerCase() + '-' + pad_(products.length + 1), name: name, brand: clean_(row[3]), detail: '', availability: clean_(row[5]), mode: 'Rental', category: section });
  });
  return Object.keys(grouped).filter(function (name) { return grouped[name].length; }).map(function (name) { return { name: name, products: grouped[name] }; });
}

function xlsxRows_(blob) {
  const files = {};
  const archive = blob.copyBlob().setContentType('application/zip');
  const entries = Utilities.unzip(archive);
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error('El Excel contiene demasiados archivos internos.');
  let expandedBytes = 0;
  entries.forEach(function (entry) {
    expandedBytes += entry.getBytes().length;
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error('El Excel expandido excede el límite permitido.');
    const name = String(entry.getName()).replace(/^\//, '');
    if (name === 'xl/sharedStrings.xml' || name === 'xl/worksheets/sheet1.xml') files[name] = entry.getDataAsString('UTF-8');
  });

  const strings = sharedStrings_(files['xl/sharedStrings.xml']);
  const xml = files['xl/worksheets/sheet1.xml'];
  if (!xml) throw new Error('El Excel no contiene una primera hoja legible.');
  const document = XmlService.parse(xml);
  const root = document.getRootElement();
  const ns = root.getNamespace();
  const sheetData = root.getChild('sheetData', ns);
  if (!sheetData) throw new Error('El Excel no contiene filas legibles.');
  const rowNodes = sheetData.getChildren('row', ns);
  if (rowNodes.length > MAX_ROWS) throw new Error('El Excel excede el máximo de filas.');

  const rows = [];
  let cellCount = 0;
  rowNodes.forEach(function (rowNode) {
    const rowAttribute = rowNode.getAttribute('r');
    if (!rowAttribute) return;
    const rowNumber = Number(rowAttribute.getValue()) - 1;
    if (rowNumber < 0 || rowNumber >= MAX_ROWS) throw new Error('Número de fila fuera de rango.');
    const row = rows[rowNumber] || [];
    rowNode.getChildren('c', ns).forEach(function (cell) {
      cellCount += 1;
      if (cellCount > MAX_CELLS) throw new Error('El Excel excede el máximo de celdas.');
      const reference = cell.getAttribute('r');
      if (!reference) return;
      const column = columnIndex_(reference.getValue());
      if (column < 0 || column >= MAX_COLUMNS) throw new Error('Columna fuera de rango.');
      const type = cell.getAttribute('t');
      const valueNode = cell.getChild('v', ns);
      let value = valueNode ? valueNode.getValue() : '';
      if (type && type.getValue() === 's') value = strings[Number(value)] || '';
      if (type && type.getValue() === 'inlineStr') { const inline = cell.getChild('is', ns); value = inline ? inline.getValue() : ''; }
      row[column] = value;
    });
    rows[rowNumber] = row;
  });
  return rows;
}

function sharedStrings_(xml) {
  if (!xml) return [];
  const document = XmlService.parse(xml);
  const root = document.getRootElement();
  const ns = root.getNamespace();
  const items = root.getChildren('si', ns);
  if (items.length > MAX_CELLS) throw new Error('Demasiadas cadenas compartidas.');
  return items.map(function (item) { return item.getValue(); });
}

function columnIndex_(reference) {
  const match = String(reference).match(/^[A-Z]+/);
  if (!match) return -1;
  const letters = match[0];
  let index = 0;
  for (let i = 0; i < letters.length; i++) index = index * 26 + letters.charCodeAt(i) - 64;
  return index - 1;
}

function output_(value, callback) {
  const json = JSON.stringify(value);
  if (callback && callback.length <= MAX_CALLBACK_LENGTH && /^[A-Za-z_$][\w$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function clean_(value) { return String(value == null ? '' : value).replace(/�/g, '°').replace(/\s+/g, ' ').trim(); }
function normalize_(value) { return clean_(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function startsWithAny_(value, words) { return words.some(function (word) { return value.indexOf(word) === 0; }); }
function pad_(number) { return ('000' + number).slice(-3); }
