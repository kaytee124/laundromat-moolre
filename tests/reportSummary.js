const fs = require('fs');
const path = require('path');

const SECURITY_NOTES = [
  '[SECURITY] CORS uses reflective origin with credentials — tighten via CORS_ORIGINS allowlist before production.',
  '[SECURITY] No rate limiting on /api/accounts/login/ or /api/customers/register/ — brute-force and spam risk.',
  '[SECURITY] Payment callback is unauthenticated — relies on Paystack verify; add idempotency and optional signed state param.',
  '[SECURITY] jwt.verify() does not pin algorithms — pass { algorithms: ["HS256"] } on every verify call.',
  '[SECURITY] Refresh token stored in HttpOnly cookie — access token remains in JSON; ensure HTTPS in production.',
  '[SECURITY] CSRF double-submit required on login, refresh, logout, and silent token refresh.',
  '[SECURITY] No express.json() body size limit — oversized payloads can exhaust memory (app-layer DoS).',
  '[SECURITY] Register returns distinct USERNAME_EXISTS vs EMAIL_EXISTS — enables user enumeration.',
  '[SECURITY] default_password returned in staff-create API responses — information disclosure.',
  '[SECURITY] LIKE search uses unescaped % wildcards — can cause slow queries under search abuse.',
  '[SECURITY] No helmet() security headers — add when serving any HTML UI.',
  '[SECURITY] Review test failures above for RBAC gaps, IDOR, mass assignment, and validation holes.',
];

const LOG_DIR = path.join(__dirname, 'logs');
const SECURITY_LOG_PATH = path.join(LOG_DIR, 'security-notes.log');

function appendSecurityLog(lines) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(SECURITY_LOG_PATH, `${lines.join('\n')}\n`);
  } catch (err) {
    console.error('Failed to write security log:', err.message);
  }
}

function printSecurityNotes() {
  const lines = ['\n--- Security analysis notes ---', ...SECURITY_NOTES];

  if (global.securityFindings?.length) {
    lines.push('\n--- Recorded findings from tests ---');
    global.securityFindings.forEach(({ code, message }) => {
      lines.push(`[FINDING:${code}] ${message}`);
    });
  }

  lines.push('--- End security notes ---\n');
  lines.forEach((line) => console.log(line));
  appendSecurityLog([`[${new Date().toISOString()}]`, ...lines]);
}

function recordFinding(code, message) {
  if (!global.securityFindings) global.securityFindings = [];
  global.securityFindings.push({ code, message });
}

module.exports = { printSecurityNotes, recordFinding, SECURITY_NOTES };
