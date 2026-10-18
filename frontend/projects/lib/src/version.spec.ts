import manifest from '../package.json';
import { ANOTOKI_LIB_VERSION } from './public-api';

describe('ANOTOKI_LIB_VERSION', () => {
  it('is the version of the package (which the release workflow checks against the tag)', () => {
    expect(ANOTOKI_LIB_VERSION).toBe(manifest.version);
  });
});
