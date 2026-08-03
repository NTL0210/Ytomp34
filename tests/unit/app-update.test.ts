import { isNewerVersion, parseVersion } from '../../electron/main/infrastructure/AppUpdateService';

describe('application update version checks', () => {
  describe('parseVersion', () => {
    it('accepts semantic versions with an optional v prefix', () => {
      expect(parseVersion('v1.2.3')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: undefined
      });
    });

    it('accepts prerelease versions', () => {
      expect(parseVersion('2.0.0-beta.1')).toEqual({
        major: 2,
        minor: 0,
        patch: 0,
        prerelease: 'beta.1'
      });
    });

    it.each(['1.2', 'latest', 'v1.2.3.4', '1.2.x', ''])('rejects invalid version %p', (version) => {
      expect(parseVersion(version)).toBeNull();
    });
  });

  describe('isNewerVersion', () => {
    it.each([
      ['1.0.1', '1.0.0'],
      ['1.1.0', '1.0.9'],
      ['2.0.0', '1.99.99'],
      ['1.0.0', '1.0.0-beta.1']
    ])('recognizes %s as newer than %s', (candidate, current) => {
      expect(isNewerVersion(candidate, current)).toBe(true);
    });

    it.each([
      ['1.0.0', '1.0.0'],
      ['1.0.0-beta.1', '1.0.0'],
      ['0.9.9', '1.0.0'],
      ['invalid', '1.0.0']
    ])('does not treat %s as newer than %s', (candidate, current) => {
      expect(isNewerVersion(candidate, current)).toBe(false);
    });
  });
});
