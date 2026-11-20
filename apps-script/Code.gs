/**
 * เทรนด์สินค้าน่าจับตา — ฝั่ง Google Apps Script (API)
 * หน้าเว็บอยู่บน GitHub Pages และเรียกสคริปต์นี้ผ่าน Web app URL
 * - ข้อมูลเก็บในชีต "สินค้า" ของ Google Sheet นี้
 * - รูปเก็บในโฟลเดอร์ Google Drive "รูปสินค้าเทรนด์"
 * - รหัสผ่านตั้งที่ Project Settings > Script properties
 *     ADMIN_PASSWORD  = รหัสผู้ดูแล (เพิ่ม/แก้/ลบได้)
 *     VIEWER_PASSWORD = รหัสผู้ชม (ดูอย่างเดียว)
 */

const SHEET_NAME = 'สินค้า';
const FOLDER_NAME = 'รูปสินค้าเทรนด์';
const SESSION_SECONDS = 6 * 60 * 60; // ล็อกอินอยู่ได้ 6 ชั่วโมง
const KEYS = ['id', 'createdAt', 'name', 'country', 'brand', 'category', 'packaging',
  'interest', 'why', 'idea', 'source', 'imageId', 'imageUrl'];
const HEADERS = ['รหัส', 'วันที่บันทึก', 'ชื่อสินค้า', 'ประเทศ', 'แบรนด์', 'หมวด', 'บรรจุภัณฑ์',
  'ความน่าสนใจ (1-5)', 'ทำไมน่าสนใจ', 'ไอเดียสำหรับบริษัท', 'ลิงก์แหล่งที่มา', 'รหัสรูป', 'ลิงก์รูป'];

/* ---------- API สำหรับหน้าเว็บบน GitHub Pages ---------- */

const API = { login, logout, listProducts, getImage, saveProduct, deleteProduct };

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ ok: true, message: 'Trend catalog API พร้อมใช้งาน' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = API[body.fn];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง');
    return json_({ ok: true, result: fn.apply(null, Array.isArray(body.args) ? body.args : []) });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/** รันครั้งเดียวตอนติดตั้ง: สร้างชีตและโฟลเดอร์รูป */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FOLDER_ID')) {
    props.setProperty('FOLDER_ID', DriveApp.createFolder(FOLDER_NAME).getId());
  }
  const missing = ['ADMIN_PASSWORD', 'VIEWER_PASSWORD'].filter(k => !props.getProperty(k));
  Logger.log(missing.length
    ? 'ติดตั้งแล้ว แต่ยังไม่ได้ตั้งรหัส: ' + missing.join(', ') + ' (ตั้งที่ Project Settings > Script properties)'
    : 'ติดตั้งเรียบร้อย พร้อมใช้งาน');
}

/* ---------- ล็อกอิน ---------- */

function login(password) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= 10) throw new Error('ใส่รหัสผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่');
  const props = PropertiesService.getScriptProperties();
  const pw = String(password || '');
  let role = null;
  if (pw && pw === props.getProperty('ADMIN_PASSWORD')) role = 'admin';
  else if (pw && pw === props.getProperty('VIEWER_PASSWORD')) role = 'viewer';
  if (!role) {
    cache.put('fails', String(fails + 1), 600);
    throw new Error('รหัสผ่านไม่ถูกต้อง');
  }
  const token = Utilities.getUuid();
  cache.put('t_' + token, role, SESSION_SECONDS);
  return { token: token, role: role };
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('t_' + token);
  return true;
}

function roleOf_(token) {
  const role = token && CacheService.getScriptCache().get('t_' + token);
  if (!role) throw new Error('SESSION_EXPIRED');
  return role;
}

function requireAdmin_(token) {
  if (roleOf_(token) !== 'admin') throw new Error('บัญชีนี้ดูได้อย่างเดียว');
}

/* ---------- ข้อมูล ---------- */

function sheet_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('ยังไม่ได้รัน setup');
  return sh;
}

function listProducts(token) {
  roleOf_(token);
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const values = sh.getRange(2, 1, n, KEYS.length).getValues();
  const out = [];
  values.forEach((r, i) => {
    const o = {};
    KEYS.forEach((k, j) => {
      const v = r[j];
      o[k] = v instanceof Date ? v.toISOString() : String(v == null ? '' : v);
    });
    if (!o.name) return;
    if (!o.id) { // แถวที่กรอกเองใน Sheet จะได้รหัสอัตโนมัติ
      o.id = Utilities.getUuid().slice(0, 8);
      sh.getRange(i + 2, 1).setValue(o.id);
    }
    if (!o.imageId && o.imageUrl) { // รองรับการวางลิงก์รูป Drive เองในชีต
      const m = o.imageUrl.match(/[-\w]{25,}/);
      if (m) o.imageId = m[0];
    }
    o.interest = Number(o.interest) || 0;
    out.push(o);
  });
  return out.reverse(); // ใหม่สุดก่อน
}

/** ส่งรูปกลับเป็น data URL (รูปใน Drive ไม่ต้องแชร์สาธารณะ) */
function getImage(token, imageId) {
  roleOf_(token);
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  const known = n > 0 ? sh.getRange(2, 12, n, 2).getDisplayValues().flat().join(' ') : '';
  if (!imageId || known.indexOf(imageId) === -1) throw new Error('ไม่พบรูปนี้');
  const blob = DriveApp.getFileById(imageId).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function saveProduct(token, d) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const clean = v => {
      v = String(v == null ? '' : v).trim().slice(0, 5000);
      return /^[=+\-@]/.test(v) ? "'" + v : v; // กันข้อความถูกตีความเป็นสูตร
    };
    let rowIdx = -1;
    if (d.id) {
      const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().flat().map(String);
      rowIdx = ids.indexOf(String(d.id));
    }
    let imageId = rowIdx >= 0 ? String(sh.getRange(rowIdx + 2, 12).getValue()) : '';
    let imageUrl = rowIdx >= 0 ? String(sh.getRange(rowIdx + 2, 13).getValue()) : '';
    if (d.image && d.image.b64) {
      const folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
      const name = String(d.name || 'product').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60) + '.jpg';
      const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(d.image.b64), 'image/jpeg', name));
      imageId = file.getId();
      imageUrl = file.getUrl();
    }
    const id = rowIdx >= 0 ? String(d.id) : Utilities.getUuid().slice(0, 8);
    const createdAt = rowIdx >= 0 ? sh.getRange(rowIdx + 2, 2).getValue() : new Date();
    const row = [id, createdAt, clean(d.name), clean(d.country), clean(d.brand), clean(d.category),
      clean(d.packaging), Math.max(0, Math.min(5, Number(d.interest) || 0)), clean(d.why), clean(d.idea),
      clean(d.source), imageId, imageUrl];
    if (rowIdx >= 0) sh.getRange(rowIdx + 2, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return id;
  } finally {
    lock.releaseLock();
  }
}

function deleteProduct(token, id) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const n = sh.getLastRow() - 1;
    if (n < 1) return false;
    const ids = sh.getRange(2, 1, n, 1).getValues().flat().map(String);
    const i = ids.indexOf(String(id));
    if (i < 0) return false;
    const imageId = String(sh.getRange(i + 2, 12).getValue());
    if (imageId) {
      try { DriveApp.getFileById(imageId).setTrashed(true); } catch (e) { /* รูปถูกลบไปแล้ว */ }
    }
    sh.deleteRow(i + 2);
    return true;
  } finally {
    lock.releaseLock();
  }
}
