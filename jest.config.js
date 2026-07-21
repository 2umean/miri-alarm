/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/__tests__/**/*.test.ts?(x)', '**/modules/**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/test/setup.js'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
  moduleNameMapper: {
    '^expo-localization$': '<rootDir>/test/stubs/expo-localization.js',
    '^react-native$': '<rootDir>/test/stubs/react-native.js',
  },
};
