/**
 * EFE Şantiye Defteri – Google Sheet köprüsü
 *
 * Bu kod, bağlı olduğu Google Sheet'i uygulamanın "veri tabanı" yapar.
 * - Uygulama notları, hatırlatıcıları, onay noktalarını, yerleri ve projeleri buraya yazar.
 * - Sheet'te satır ekleyip düzeltirsen, bir sonraki eşitlemede uygulamaya gelir.
 * - Fotoğraflar senin Drive'ındaki "EFE Şantiye Defteri – Fotoğraflar" klasörüne yüklenir.
 * Her istek, sadece sende olan gizli anahtarla kabul edilir.
 */

var TABS = {
  projects: { name: "Projeler", cols: [["Ad","name"],["Adres","address"],["Arşivli","archived"],["Sil","del"],["Güncellendi","u"],["id","id"]] },
  notes: { name: "Notlar", cols: [["Tarih","date"],["Saat","time"],["Proje","project"],["Yer","where"],["Not","text"],["Sil","del"],["Güncellendi","u"],["id","id"]] },
  reminders: { name: "Hatırlatıcılar", cols: [["Proje","project"],["Hatırlatıcı","text"],["Tarih","due"],["Bitti","done"],["Sil","del"],["Güncellendi","u"],["id","id"]] },
  holds: { name: "Onay noktaları", cols: [["Proje","project"],["Madde","text"],["Bitti","done"],["Bitiş tarihi","date"],["Sil","del"],["Güncellendi","u"],["id","id"]] },
  places: { name: "Yerler", cols: [["Proje","project"],["Yer","text"],["Sil","del"],["Güncellendi","u"],["id","id"]] },
  photos: { name: "Fotoğraflar", cols: [["Tarih","date"],["Proje","project"],["Not","note"],["Etiket","tag"],["Fotoğraf linki","url"],["Sil","del"],["Güncellendi","u"],["id","id"]] }
};
var BOOL = { archived: 1, done: 1, del: 1 };
var TEXTLIKE = { date: 1, due: 1, time: 1, id: 1 };

/* ---------- menü ve kurulum ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("EFE")
    .addItem("Tabloları hazırla / onar", "kurulum")
    .addItem("Bağlantı bilgisini göster", "baglantiBilgisi")
    .addToUi();
}

function kurulum() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("KEY")) {
    props.setProperty("KEY", Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, ""));
  }
  Object.keys(TABS).forEach(function (k) { ensureSheet_(k); });
  var ss = ss_();
  ["Sayfa1", "Sheet1"].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  Logger.log("Kurulum tamam. Menüden EFE > Bağlantı bilgisini göster'i kullan.");
}

function baglantiBilgisi() {
  var url = ScriptApp.getService().getUrl() || "(önce Dağıt > Yeni dağıtım yap)";
  var key = PropertiesService.getScriptProperties().getProperty("KEY") || "(önce kurulum çalıştır)";
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px Arial,sans-serif;line-height:1.5">' +
    '<p><b>Bağlantı adresi</b><br><textarea readonly style="width:100%;height:56px" onclick="this.select()">' + url + '</textarea></p>' +
    '<p><b>Anahtar</b> (kimseyle paylaşma)<br><textarea readonly style="width:100%;height:56px" onclick="this.select()">' + key + '</textarea></p>' +
    '<p>İkisini de uygulamada Ayarlar > Google Sheet bağlantısı kısmına yapıştır.</p></div>'
  ).setWidth(520).setHeight(330);
  SpreadsheetApp.getUi().showModalDialog(html, "EFE bağlantı bilgisi");
}

/* ---------- web uygulaması ---------- */
function doGet() {
  return ContentService.createTextOutput("EFE köprüsü çalışıyor.");
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var key = PropertiesService.getScriptProperties().getProperty("KEY");
    if (!key || req.key !== key) {
      out = { ok: false, error: "auth" };
    } else if (req.action === "ping") {
      out = { ok: true, version: 1, time: Date.now() };
    } else if (req.action === "sync") {
      out = sync_(req);
    } else if (req.action === "photo") {
      out = photo_(req);
    } else {
      out = { ok: false, error: "bilinmeyen işlem" };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- eşitleme ---------- */
function sync_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var state = {}, deleted = {};
    Object.keys(TABS).forEach(function (key) {
      var t = loadTab_(key);
      var ops = (req.ops && req.ops[key]) || {};
      var byId = {};
      t.recs.forEach(function (r) { byId[r.id] = r; });
      (ops.remove || []).forEach(function (id) {
        if (byId[id]) {
          t.recs = t.recs.filter(function (r) { return r.id !== id; });
          delete byId[id];
          t.changed = true;
        }
      });
      var now = Date.now();
      (ops.upsert || []).forEach(function (rec) {
        if (!rec || !rec.id || t.deleted.indexOf(rec.id) >= 0) return;
        var cur = byId[rec.id];
        if (!cur) { cur = { _raw: null, id: rec.id }; t.recs.push(cur); byId[rec.id] = cur; }
        t.def.cols.forEach(function (c) {
          var f = c[1];
          if (f === "id" || f === "u" || f === "del") return;
          if (Object.prototype.hasOwnProperty.call(rec, f)) cur[f] = rec[f];
        });
        cur.del = false;
        cur.u = now;
        t.changed = true;
      });
      if (t.changed) saveTab_(t);
      state[key] = t.recs.map(strip_);
      deleted[key] = t.deleted;
    });
    return { ok: true, state: state, deleted: deleted, time: Date.now() };
  } finally {
    lock.releaseLock();
  }
}

function strip_(r) {
  var o = {};
  Object.keys(r).forEach(function (k) { if (k !== "_raw") o[k] = r[k]; });
  return o;
}

/* ---------- fotoğraf yükleme ---------- */
function photo_(req) {
  var folder = photoFolder_();
  var name = (req.id || "foto") + ".jpg";
  var existing = folder.getFilesByName(name);
  if (existing.hasNext()) {
    var f0 = existing.next();
    return { ok: true, fileId: f0.getId(), url: f0.getUrl() };
  }
  var bytes = Utilities.base64Decode(req.data);
  var blob = Utilities.newBlob(bytes, req.mime || "image/jpeg", name);
  var file = folder.createFile(blob);
  return { ok: true, fileId: file.getId(), url: file.getUrl() };
}

function photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("PHOTO_FOLDER");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder("EFE Şantiye Defteri – Fotoğraflar");
  props.setProperty("PHOTO_FOLDER", f.getId());
  return f;
}

/* ---------- Sheet'ten elle düzenleme: satıra id ve zaman damgası ver ---------- */
function onEdit(e) {
  try {
    var sh = e.range.getSheet();
    var key = keyByName_(sh.getName());
    if (!key) return;
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var uCol = head.indexOf("Güncellendi") + 1, idCol = head.indexOf("id") + 1;
    if (!uCol || !idCol) return;
    var r1 = Math.max(e.range.getRow(), 2), r2 = e.range.getRow() + e.range.getNumRows() - 1;
    for (var r = r1; r <= r2; r++) {
      var row = sh.getRange(r, 1, 1, head.length).getValues()[0];
      var empty = row.every(function (v, i) { return i + 1 === uCol || i + 1 === idCol || v === "" || v === null; });
      if (empty) continue;
      if (!sh.getRange(r, idCol).getValue()) sh.getRange(r, idCol).setValue(Utilities.getUuid());
      sh.getRange(r, uCol).setValue(Date.now());
    }
  } catch (err) {}
}

/* ---------- yardımcılar ---------- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return Session.getScriptTimeZone() || "America/Toronto"; }
function keyByName_(name) {
  var found = null;
  Object.keys(TABS).forEach(function (k) { if (TABS[k].name === name) found = k; });
  return found;
}

function ensureSheet_(key) {
  var def = TABS[key], ss = ss_();
  var sh = ss.getSheetByName(def.name);
  var heads = def.cols.map(function (c) { return c[0]; });
  if (!sh) sh = ss.insertSheet(def.name);
  var lastCol = sh.getLastColumn();
  var cur = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (!cur.length || cur[0] === "") {
    sh.getRange(1, 1, 1, heads.length).setValues([heads]);
    format_(sh, key);
  } else {
    var missing = heads.filter(function (h) { return cur.indexOf(h) < 0; });
    if (missing.length) sh.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]);
  }
  return sh;
}

function format_(sh, key) {
  try {
    var def = TABS[key];
    sh.getRange(1, 1, 1, def.cols.length).setFontWeight("bold").setBackground("#E3EEF0");
    sh.setFrozenRows(1);
    def.cols.forEach(function (c, i) {
      if (TEXTLIKE[c[1]]) sh.getRange(2, i + 1, 998, 1).setNumberFormat("@");
      if (c[1] === "u" || c[1] === "id") sh.hideColumns(i + 1);
      if (BOOL[c[1]]) {
        var rule = SpreadsheetApp.newDataValidation().requireValueInList(["EVET"], true).setAllowInvalid(true).build();
        sh.getRange(2, i + 1, 998, 1).setDataValidation(rule);
      }
      if (c[1] === "text" || c[1] === "note") sh.setColumnWidth(i + 1, 420);
    });
  } catch (e) {}
}

function loadTab_(key) {
  var def = TABS[key], sh = ensureSheet_(key);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var colOf = {};
  def.cols.forEach(function (c) { colOf[c[1]] = head.indexOf(c[0]); });
  var values = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  var t = { key: key, def: def, sh: sh, head: head, colOf: colOf, recs: [], deleted: [], changed: false, oldRows: lastRow - 1 };
  values.forEach(function (row) {
    var rec = { _raw: row };
    def.cols.forEach(function (c) {
      var i = colOf[c[1]];
      rec[c[1]] = readCell_(c[1], i >= 0 ? row[i] : "");
    });
    var hasContent = def.cols.some(function (c) {
      return c[1] !== "id" && c[1] !== "u" && c[1] !== "del" && rec[c[1]] !== "" && rec[c[1]] !== false;
    });
    if (!hasContent) { t.changed = true; return; }
    if (!rec.id) { rec.id = Utilities.getUuid(); t.changed = true; }
    if (!rec.u) { rec.u = Date.now(); t.changed = true; }
    if (rec.del) { t.deleted.push(rec.id); t.changed = true; return; }
    t.recs.push(rec);
  });
  return t;
}

function saveTab_(t) {
  var width = t.head.length;
  var rows = t.recs.map(function (rec) {
    var row = rec._raw ? rec._raw.slice() : [];
    while (row.length < width) row.push("");
    t.def.cols.forEach(function (c) {
      var i = t.colOf[c[1]];
      if (i >= 0) row[i] = writeCell_(c[1], rec[c[1]]);
    });
    return row;
  });
  if (t.oldRows > 0) t.sh.getRange(2, 1, t.oldRows, width).clearContent();
  if (rows.length) {
    try {
      t.def.cols.forEach(function (c) {
        var i = t.colOf[c[1]];
        if (i >= 0 && TEXTLIKE[c[1]]) t.sh.getRange(2, i + 1, rows.length, 1).setNumberFormat("@");
      });
    } catch (e) {}
    t.sh.getRange(2, 1, rows.length, width).setValues(rows);
  }
  t.oldRows = rows.length;
}

function truthy_(v) {
  return v === true || /^(evet|e|x|✓|✔|true|1|yes|ok)$/i.test(String(v === null || v === undefined ? "" : v).trim());
}

function pad2_(n) { return (n < 10 ? "0" : "") + n; }

function normDate_(v) {
  if (v === "" || v === null || v === undefined) return "";
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), "yyyy-MM-dd");
  if (typeof v === "number") {
    var d = new Date(Math.round((v - 25569) * 86400000));
    return d.getUTCFullYear() + "-" + pad2_(d.getUTCMonth() + 1) + "-" + pad2_(d.getUTCDate());
  }
  var s = String(v).trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + "-" + pad2_(+m[2]) + "-" + pad2_(+m[3]);
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) return m[3] + "-" + pad2_(+m[2]) + "-" + pad2_(+m[1]);
  return s;
}

function normTime_(v) {
  if (v === "" || v === null || v === undefined) return "";
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), "HH:mm");
  if (typeof v === "number") {
    var mins = Math.round(v * 1440);
    return pad2_(Math.floor(mins / 60) % 24) + ":" + pad2_(mins % 60);
  }
  var s = String(v).trim(), m = s.match(/^(\d{1,2})[:.](\d{2})\s*([ap]\.?m\.?)?/i);
  if (!m) return s;
  var h = +m[1];
  if (m[3]) { var pm = /^p/i.test(m[3]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return pad2_(h) + ":" + m[2];
}

function readCell_(f, v) {
  if (f === "u") {
    if (v instanceof Date) return v.getTime();
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }
  if (BOOL[f]) return truthy_(v);
  if (f === "date" || f === "due") return normDate_(v);
  if (f === "time") return normTime_(v);
  return v === null || v === undefined ? "" : String(v).trim();
}

function writeCell_(f, v) {
  if (BOOL[f]) return v ? "EVET" : "";
  if (f === "u") return v || 0;
  return v === null || v === undefined ? "" : v;
}
