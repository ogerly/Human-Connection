module.exports = {
  env: {
    es6: true,
    node: true,
    'jest/globals': true
  },
  parserOptions: {
    parser: 'babel-eslint'
  },
  extends: [
    'standard',
    'plugin:vue/recommended',
    'plugin:prettier/recommended'
  ],
  plugins: [
    'jest'
  ]
  rules: {
    'indent': [ 'error', 2 ],
    'quotes': [ "error", "single"],
    // 'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-console': ['error'],
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'prettier/prettier': ['error'],
  },
};
