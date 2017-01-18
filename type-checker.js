var TypeChecker = {

  checkType: function checkType (value, type, required) {
    if (!type) {
      return false
    }

    if (value === undefined) {
      return !required
    }

    return this['is' + this.capitalizeFirstLetter(type)](value)
  },

  capitalizeFirstLetter: function capitalizeFirstLetter (string) {
    return string.charAt(0).toUpperCase() + string.slice(1)
  },

  isNumber: function isNumber (value) {
    return typeof value === 'number'
  },
  isString: function isString (value) {
    return typeof value === 'string'
  },
  isObject: function isObject (value) {
    return typeof value === 'object' && typeof value.length !== 'number'
  },
  isArray: function isArray (value) {
    return typeof value === 'object' && typeof value.length === 'number'
  }
}

module.exports = TypeChecker
