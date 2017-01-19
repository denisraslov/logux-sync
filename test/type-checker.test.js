var TypeChecker = require('../type-checker')

function checkType (value, type, required) {
  return TypeChecker.checkType(value, type, required)
}

it('check right types', function () {
  expect(checkType(1, 'number')).toBeTruthy()
  expect(checkType('abc', 'string')).toBeTruthy()
  expect(checkType([], 'array')).toBeTruthy()
  expect(checkType({}, 'object')).toBeTruthy()
})

it('check wrong types', function () {
  expect(checkType(1, 'string')).toBeFalsy()
  expect(checkType('abc', 'number')).toBeFalsy()
  expect(checkType([], 'string')).toBeFalsy()
  expect(checkType([], 'object')).toBeFalsy()
  expect(checkType({}, 'array')).toBeFalsy()
})

it('check required', function () {
  expect(checkType(1, 'number', true)).toBeTruthy()
  expect(checkType({}, 'object', true)).toBeTruthy()
  expect(checkType(undefined, 'object', false)).toBeTruthy()
  expect(checkType(undefined, 'object', true)).toBeFalsy()
})

it('check undefined type', function () {
  expect(checkType(1, undefined, true)).toBeFalsy()
  expect(checkType('abc', undefined, false)).toBeFalsy()
})
