/**
 * เทรนด์สินค้าน่าจับตา — ฝั่ง Google Apps Script (API)
 * หน้าเว็บอยู่บน GitHub Pages และเรียกสคริปต์นี้ผ่าน Web app URL
 * - ข้อมูลสินค้าเก็บในชีต "สินค้า" ความเห็นและโหวตเก็บในชีต "ความเห็น"
 * - รูปเก็บในโฟลเดอร์ Google Drive "รูปสินค้าเทรนด์"
 * - รหัสผ่านตั้งที่ Project Settings > Script properties
 *     ADMIN_PASSWORD  = รหัสผู้ดูแล (เพิ่ม/แก้/ลบได้)
 *     VIEWER_PASSWORD = รหัสผู้ชม (ดู โหวต และคอมเมนต์ได้)
 * แก้โค้ดนี้แล้ว: รัน setup อีกครั้ง และ Deploy > Manage deployments > แก้ไข > New version
 */

const SHEET_NAME = 'สินค้า';
const COMMENT_SHEET = 'ความเห็น';
const FOLDER_NAME = 'รูปสินค้าเทรนด์';
const SESSION_SECONDS = 6 * 60 * 60; // ล็อกอินอยู่ได้ 6 ชั่วโมง
const MAX_EXTRA = 4;                  // รูปเพิ่มเติมสูงสุดต่อสินค้า
const KEYS = ['id', 'createdAt', 'name', 'country', 'brand', 'category', 'packaging',
  'interest', 'why', 'idea', 'source', 'imageId', 'imageUrl', 'status', 'images'];
const HEADERS = ['รหัส', 'วันที่บันทึก', 'ชื่อสินค้า', 'ประเทศ', 'แบรนด์', 'หมวด', 'บรรจุภัณฑ์',
  'ความน่าสนใจ (1-5)', 'ทำไมน่าสนใจ', 'ไอเดียสำหรับบริษัท', 'ลิงก์แหล่งที่มา', 'รหัสรูป', 'ลิงก์รูป',
  'สถานะ', 'รูปเพิ่มเติม (รหัส)'];
const C_HEADERS = ['รหัสความเห็น', 'วันที่', 'รหัสสินค้า', 'ประเภท', 'ชื่อ', 'ข้อความ', 'บทบาท'];

/* ---------- API สำหรับหน้าเว็บบน GitHub Pages ---------- */

const API = { login, logout, listProducts, getImage, saveProduct, deleteProduct, setStatus,
  listComments, addComment, deleteComment };

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

/** รันตอนติดตั้ง และรันซ้ำได้หลังอัปเดตโค้ด (เพิ่มคอลัมน์ใหม่ให้อัตโนมัติ) */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  else sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  commentsSheet_();
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
  if (roleOf_(token) !== 'admin') throw new Error('บัญชีนี้ไม่มีสิทธิ์แก้ไข');
}

/* ---------- ตัวช่วย ---------- */

function sheet_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('ยังไม่ได้รัน setup');
  return sh;
}

function commentsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(COMMENT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(COMMENT_SHEET);
    sh.appendRow(C_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, C_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function folder_() {
  return DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
}

function clean_(v, max) {
  v = String(v == null ? '' : v).trim().slice(0, max || 5000);
  return /^[=+\-@]/.test(v) ? "'" + v : v; // กันข้อความถูกตีความเป็นสูตร
}

function rowIndexOf_(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n < 1 || !id) return -1;
  return sh.getRange(2, 1, n, 1).getValues().flat().map(String).indexOf(String(id));
}

function trash_(id) {
  if (!id) return;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ไฟล์ถูกลบไปแล้ว */ }
}

function upload_(folder, b64, baseName) {
  const name = String(baseName || 'product').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60) + '.jpg';
  return folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', name));
}

/* ---------- สินค้า ---------- */

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
    o.status = o.status || 'กำลังศึกษา';
    o.images = o.images.split(',').map(s => s.trim()).filter(Boolean);
    out.push(o);
  });
  return out.reverse(); // ใหม่สุดก่อน
}

/** ส่งรูปกลับเป็น data URL (รูปใน Drive ไม่ต้องแชร์สาธารณะ) */
function getImage(token, imageId) {
  roleOf_(token);
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  const known = n > 0 ? sh.getRange(2, 12, n, 4).getDisplayValues().flat().join(' ') : '';
  if (!imageId || known.indexOf(imageId) === -1) throw new Error('ไม่พบรูปนี้');
  const blob = DriveApp.getFileById(imageId).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function saveProduct(token, d) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = sheet_();
    const rowIdx = rowIndexOf_(sh, d.id);
    const old = rowIdx >= 0 ? sh.getRange(rowIdx + 2, 1, 1, KEYS.length).getValues()[0] : null;
    let imageId = old ? String(old[11]) : '';
    let imageUrl = old ? String(old[12]) : '';
    let extras = old ? String(old[14]).split(',').map(s => s.trim()).filter(Boolean) : [];
    let folder = null;
    const getFolder = () => folder || (folder = folder_());

    if (d.image && d.image.b64) {
      const f = upload_(getFolder(), d.image.b64, d.name);
      imageId = f.getId();
      imageUrl = f.getUrl();
    }
    if (Array.isArray(d.keepExtra)) {
      extras.filter(id => d.keepExtra.indexOf(id) === -1).forEach(trash_);
      extras = extras.filter(id => d.keepExtra.indexOf(id) > -1);
    }
    (Array.isArray(d.newExtra) ? d.newExtra : []).forEach((im, k) => {
      if (im && im.b64 && extras.length < MAX_EXTRA) {
        extras.push(upload_(getFolder(), im.b64, (d.name || 'product') + '-' + (extras.length + 2)).getId());
      }
    });

    const id = rowIdx >= 0 ? String(d.id) : Utilities.getUuid().slice(0, 8);
    const createdAt = old ? old[1] : new Date();
    const row = [id, createdAt, clean_(d.name), clean_(d.country), clean_(d.brand), clean_(d.category),
      clean_(d.packaging), Math.max(0, Math.min(5, Number(d.interest) || 0)), clean_(d.why), clean_(d.idea),
      clean_(d.source), imageId, imageUrl, clean_(d.status || 'กำลังศึกษา', 60), extras.join(',')];
    if (rowIdx >= 0) sh.getRange(rowIdx + 2, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return id;
  } finally {
    lock.releaseLock();
  }
}

function setStatus(token, id, status) {
  requireAdmin_(token);
  const sh = sheet_();
  const i = rowIndexOf_(sh, id);
  if (i < 0) throw new Error('ไม่พบสินค้านี้');
  sh.getRange(i + 2, 14).setValue(clean_(status, 60));
  return true;
}

function deleteProduct(token, id) {
  requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const i = rowIndexOf_(sh, id);
    if (i < 0) return false;
    const r = sh.getRange(i + 2, 1, 1, KEYS.length).getValues()[0];
    trash_(String(r[11]));
    String(r[14]).split(',').map(s => s.trim()).filter(Boolean).forEach(trash_);
    sh.deleteRow(i + 2);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- ความเห็นและโหวต ---------- */

function listComments(token) {
  roleOf_(token);
  const sh = commentsSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, C_HEADERS.length).getValues()
    .filter(r => r[0] && r[2])
    .map(r => ({
      id: String(r[0]),
      date: r[1] instanceof Date ? r[1].toISOString() : String(r[1]),
      productId: String(r[2]),
      kind: String(r[3]) === 'like' ? 'like' : 'comment',
      name: String(r[4]),
      text: String(r[5]),
      role: String(r[6])
    }));
}

function addComment(token, productId, kind, name, text) {
  const role = roleOf_(token);
  kind = kind === 'like' ? 'like' : 'comment';
  name = clean_(name || 'ไม่ระบุชื่อ', 60);
  text = kind === 'like' ? '' : clean_(text, 1000);
  if (kind === 'comment' && !text) throw new Error('กรุณาพิมพ์ความเห็น');
  if (rowIndexOf_(sheet_(), productId) < 0) throw new Error('ไม่พบสินค้านี้');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const c = { id: Utilities.getUuid().slice(0, 10), date: new Date().toISOString(),
      productId: String(productId), kind: kind, name: name, text: text, role: role };
    commentsSheet_().appendRow([c.id, new Date(), c.productId, c.kind, c.name, c.text, c.role]);
    return c;
  } finally {
    lock.releaseLock();
  }
}

function deleteComment(token, id) {
  requireAdmin_(token);
  const sh = commentsSheet_();
  const i = rowIndexOf_(sh, id);
  if (i < 0) return false;
  sh.deleteRow(i + 2);
  return true;
}
