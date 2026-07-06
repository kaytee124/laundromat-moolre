function parseUssdNew(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

function tryParseJsonString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function hasStandardUssdFields(body) {
  return body.sessionId != null || body.sessionid != null;
}

function parseUssdCallbackBody(req) {
  const body = req.body;

  if (body && typeof body === 'object' && !Array.isArray(body) && hasStandardUssdFields(body)) {
    return body;
  }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const keys = Object.keys(body);
    if (keys.length === 1) {
      const parsedFromKey = tryParseJsonString(keys[0]);
      if (parsedFromKey) return parsedFromKey;
    }

    for (const field of ['data', 'payload', 'body']) {
      const parsedFromField = tryParseJsonString(body[field]);
      if (parsedFromField) return parsedFromField;
    }
  }

  if (typeof body === 'string') {
    const parsed = tryParseJsonString(body);
    if (parsed) return parsed;
  }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    console.error(
      JSON.stringify({
        event: 'ussd_body_parse_failed',
        contentType: req.headers['content-type'],
        bodyKeys: Object.keys(body),
      })
    );
  }

  return {};
}

module.exports = {
  parseUssdCallbackBody,
  parseUssdNew,
};
