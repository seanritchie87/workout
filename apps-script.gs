/**
 * Sean's Workout App — Google Apps Script backend
 *
 * HOW TO DEPLOY:
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Delete all existing code and paste this entire file
 * 3. Run initialSetup() once (select it from the dropdown and click Run)
 *    - This stores the AUTH_TOKEN in Script Properties securely
 *    - You will be prompted to authorize the script — click Allow
 * 4. Click Deploy → New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Click Deploy, copy the Web app URL → that is your SHEETS_URL GitHub Secret
 *
 * UPDATING THE SCRIPT:
 * After any code change, go to Deploy → Manage deployments →
 * click the pencil icon → set Version to "New version" → Deploy.
 */

// ============================================================
// ONE-TIME SETUP — run this once after pasting the script
// ============================================================

/**
 * Run this function ONCE from the Apps Script editor to store the
 * auth token securely in Script Properties. Never hard-code the
 * token in this file.
 *
 * Replace the value below with your actual AUTH_TOKEN before running.
 */
function initialSetup() {
  var AUTH_TOKEN = '0eb732e98e687d62d204657e2ce93aeb'; // replace if you regenerate
  PropertiesService.getScriptProperties().setProperty('AUTH_TOKEN', AUTH_TOKEN);
  Logger.log('AUTH_TOKEN stored in Script Properties. You can delete it from this function now.');
}

// ============================================================
// CONSTANTS
// ============================================================

var ALLOWED_SHEETS = ['Workouts', 'Bodyweight', 'CheckIns'];
var MAX_ROW_FIELDS = 20;
var MAX_FIELD_LENGTH = 500;
var MAX_WRITES_PER_HOUR = 100;
var RATE_KEY = 'rate_';

// ============================================================
// AUTH HELPERS
// ============================================================

function getStoredToken() {
  return PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
}

function validateToken(token) {
  var stored = getStoredToken();
  if (!stored || !token) return false;
  // Constant-time comparison to prevent timing attacks
  if (stored.length !== token.length) return false;
  var match = true;
  for (var i = 0; i < stored.length; i++) {
    if (stored.charCodeAt(i) !== token.charCodeAt(i)) match = false;
  }
  return match;
}

function unauthorizedResponse() {
  return ContentService
    .createTextOutput(JSON.stringify({status: 'error', message: 'Unauthorized'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// RATE LIMITING
// ============================================================

function isRateLimited() {
  var props = PropertiesService.getScriptProperties();
  var hourKey = RATE_KEY + Math.floor(Date.now() / 3600000);

  // Clean up old hour keys (keep storage tidy)
  var allProps = props.getProperties();
  Object.keys(allProps).forEach(function(k) {
    if (k.indexOf(RATE_KEY) === 0 && k !== hourKey) {
      props.deleteProperty(k);
    }
  });

  var count = parseInt(props.getProperty(hourKey) || '0', 10);
  if (count >= MAX_WRITES_PER_HOUR) return true;
  props.setProperty(hourKey, String(count + 1));
  return false;
}

function rateLimitResponse() {
  return ContentService
    .createTextOutput(JSON.stringify({status: 'error', message: 'Rate limit exceeded. Try again later.'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// INPUT VALIDATION
// ============================================================

function validateInput(data) {
  if (!data.sheet || ALLOWED_SHEETS.indexOf(data.sheet) === -1) {
    return 'Invalid sheet name. Must be one of: ' + ALLOWED_SHEETS.join(', ');
  }
  if (!Array.isArray(data.row)) {
    return 'row must be an array';
  }
  if (data.row.length > MAX_ROW_FIELDS) {
    return 'Row has too many fields (max ' + MAX_ROW_FIELDS + ')';
  }
  for (var i = 0; i < data.row.length; i++) {
    var field = String(data.row[i] === null || data.row[i] === undefined ? '' : data.row[i]);
    if (field.length > MAX_FIELD_LENGTH) {
      return 'Field ' + i + ' exceeds max length of ' + MAX_FIELD_LENGTH + ' characters';
    }
  }
  if (data.headers && !Array.isArray(data.headers)) {
    return 'headers must be an array';
  }
  return null; // valid
}

// ============================================================
// POST — write a row
// ============================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (!validateToken(data.token)) {
      return unauthorizedResponse();
    }

    if (isRateLimited()) {
      return rateLimitResponse();
    }

    var validationError = validateInput(data);
    if (validationError) {
      return ContentService
        .createTextOutput(JSON.stringify({status: 'error', message: validationError}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(data.sheet) || ss.insertSheet(data.sheet);

    if (sheet.getLastRow() === 0 && data.headers) {
      sheet.appendRow(data.headers);
      sheet.getRange(1, 1, 1, data.headers.length)
           .setFontWeight('bold')
           .setBackground('#1a1a2e')
           .setFontColor('#ffffff');
    }

    // Sanitize row values to strings
    var safeRow = data.row.map(function(v) {
      return v === null || v === undefined ? '' : String(v).substring(0, MAX_FIELD_LENGTH);
    });
    sheet.appendRow(safeRow);

    return ContentService
      .createTextOutput(JSON.stringify({status: 'ok'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({status: 'error', message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// GET — read rows back for charts
// ============================================================

function doGet(e) {
  try {
    var token = e.parameter.token;
    if (!validateToken(token)) {
      return unauthorizedResponse();
    }

    var sheetName = e.parameter.sheet || 'Workouts';
    if (ALLOWED_SHEETS.indexOf(sheetName) === -1) {
      return ContentService
        .createTextOutput(JSON.stringify({status: 'error', message: 'Invalid sheet name'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({status: 'ok', rows: []}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = sheet.getDataRange().getValues();
    return ContentService
      .createTextOutput(JSON.stringify({status: 'ok', rows: data}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({status: 'error', message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
