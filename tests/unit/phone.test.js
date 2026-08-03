const {
  isValidGhanaPhone,
  assertValidGhanaPhone,
  normalizeValidGhanaPhone,
} = require('../../utils/phone');
const { AppError } = require('../../utils/errors');

describe('Ghana phone validation', () => {
  it('accepts local 10-digit and +233 forms', () => {
    expect(isValidGhanaPhone('0502412618')).toBe(true);
    expect(isValidGhanaPhone('+233502412618')).toBe(true);
    expect(normalizeValidGhanaPhone('+233502412618')).toBe('0502412618');
    expect(normalizeValidGhanaPhone('0502412618')).toBe('0502412618');
  });

  it('rejects invalid formats', () => {
    for (const bad of ['233502412618', '502412618', '050241261', '05024126180', '+23350241261', '']) {
      expect(isValidGhanaPhone(bad)).toBe(false);
      expect(() => assertValidGhanaPhone(bad)).toThrow(AppError);
    }
  });
});
