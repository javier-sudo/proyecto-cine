/**
 * API pública de solo lectura para KIMUN.
 * Lee los cinco Excel originales de la carpeta compartida en cada consulta.
 */
const DRIVE_FILES = {
  camera: '1jHuMsA9IgwHRnoDAYgFhrKZOjRa7Q45R',
  light: '1_vsaDRDfVurHqjusgp0WVVFY6wDkvbkK',
  sound: '1pcF7BJXhNt_YbHf3V6J0ZpedgJ6h2Tc1',
  production: '1e_R-xXwkURkzvUkh72bdecb5Q2sc7oM2',
  rental: '1RnUWQZCdlnu7U0Sy5o7-Kb7u34azfsnZ'
};

function doGet(e) {
  const callback = String((e && e.parameter && e.parameter.callback) || '');
  try {
    return output_({ success: true, updatedAt: new Date().toISOString(), catalog: buildCatalog_() }, callback);
  } catch (error) {
    console.error(error);
    return output_({ success: false, message: 'No fue posible leer el catálogo desde Drive.' }, callback);
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
  const keys = Object.keys(DRIVE_FILES);
  const requests = keys.map(function (key) {
    return { url: 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(DRIVE_FILES[key]) + '&export=download&confirm=t', muteHttpExceptions: true, followRedirects: true };
  });
  const responses = UrlFetchApp.fetchAll(requests);
  const rows = {};
  responses.forEach(function (response, index) {
    if (response.getResponseCode() !== 200) throw new Error('Drive respondió ' + response.getResponseCode() + ' para ' + keys[index]);
    rows[keys[index]] = xlsxRows_(response.getBlob());
  });
  return rows;
}

function saleCategory_(rows, label, prefix) {
  const products = [];
  rows.forEach(function (row) {
    const name = clean_(row[1]);
    const lowered = normalize_(name);
    if (!name || lowered === 'kimun spa' || startsWithAny_(lowered, ['insumos', 'total', 'iva', 'contacto'])) return;
    products.push({ id: prefix + '-' + pad_(products.length + 1), name: name, brand: clean_(row[3]), detail: clean_(row[4]), mode: 'Venta', category: label });
  });
  return { name: label, products: products };
}

function rentalCategories_(rows) {
  const names = { HMI: 'HMI', TUNGTENO: 'Tungsteno', LED: 'LED', TUBOS: 'Tubos', OTROS: 'Otros', ACCESORIOS: 'Accesorios' };
  const grouped = { HMI: [], Tungsteno: [], LED: [], Tubos: [], Otros: [], Accesorios: [] };
  let section = 'Otros';
  rows.forEach(function (row) {
    const name = clean_(row[1]);
    if (!name) return;
    const upper = name.toUpperCase();
    if (names[upper]) { section = names[upper]; return; }
    const lowered = normalize_(name);
    if (startsWithAny_(lowered, ['total', 'iva', 'contacto', 'kimuntecnica'])) return;
    const products = grouped[section];
    products.push({ id: 'ren-' + section.slice(0, 3).toLowerCase() + '-' + pad_(products.length + 1), name: name, brand: clean_(row[3]), detail: '', availability: clean_(row[5]), mode: 'Rental', category: section });
  });
  return Object.keys(grouped).filter(function (name) { return grouped[name].length; }).map(function (name) { return { name: name, products: grouped[name] }; });
}

function xlsxRows_(blob) {
  const files = {};
  const archive = blob.setContentType('application/zip');
  Utilities.unzip(archive).forEach(function (blob) { files[String(blob.getName()).replace(/^\//, '')] = blob.getDataAsString('UTF-8'); });
  const strings = sharedStrings_(files['xl/sharedStrings.xml']);
  const xml = files['xl/worksheets/sheet1.xml'];
  if (!xml) throw new Error('El Excel no contiene una primera hoja legible.');
  const document = XmlService.parse(xml);
  const root = document.getRootElement();
  const ns = root.getNamespace();
  const rows = [];
  root.getChild('sheetData', ns).getChildren('row', ns).forEach(function (rowNode) {
    const rowNumber = Number(rowNode.getAttribute('r').getValue()) - 1;
    const row = rows[rowNumber] || [];
    rowNode.getChildren('c', ns).forEach(function (cell) {
      const column = columnIndex_(cell.getAttribute('r').getValue());
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
  return root.getChildren('si', ns).map(function (item) { return item.getValue(); });
}

function columnIndex_(reference) {
  const letters = String(reference).match(/^[A-Z]+/)[0];
  let index = 0;
  for (let i = 0; i < letters.length; i++) index = index * 26 + letters.charCodeAt(i) - 64;
  return index - 1;
}

function output_(value, callback) {
  const json = JSON.stringify(value);
  if (/^[A-Za-z_$][\w$\.]*$/.test(callback)) return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function clean_(value) { return String(value == null ? '' : value).replace(/�/g, '°').replace(/\s+/g, ' ').trim(); }
function normalize_(value) { return clean_(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function startsWithAny_(value, words) { return words.some(function (word) { return value.indexOf(word) === 0; }); }
function pad_(number) { return ('000' + number).slice(-3); }
