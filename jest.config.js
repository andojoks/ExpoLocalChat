module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.eas-inspect/', '/dist/'],
  modulePathIgnorePatterns: ['<rootDir>/.eas-inspect', '<rootDir>/dist'],
  collectCoverageFrom: ['src/ai/embeddings/embedding.ts', 'src/data/questions.ts'],
};
