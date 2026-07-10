module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    'no-console': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    'no-case-declarations': 'warn',
    'no-empty': 'warn',
    'no-inner-declarations': 'warn',
    'prefer-const': 'warn',
  },
  env: {
    node: true,
    es2022: true,
  },
};
