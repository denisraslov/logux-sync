var TypeChecker = require('./type-checker')
var SyncError = require('./sync-error')

function checkType (value, type, required) {
  return TypeChecker.checkType(value, type, required)
}

module.exports = {

  validateMessageFormat: function validateMessageFormat (msg) {
    return checkType(msg, 'array', true) &&
      checkType(msg[0], 'string', true)
  },

  validateConnect: function validateConnect (ver, nodeId, synced, options) {
    return checkType(nodeId, 'string', true) &&
      checkType(synced, 'number', true) &&
      checkType(options, 'object', false)
  },

  validateConnected: function validateConnected (ver, nodeId, time, options) {
    return checkType(nodeId, 'string', true) &&
      checkType(time, 'array', true) && time.length === 2 &&
      checkType(time[0], 'number', true) &&
      checkType(time[1], 'number', true) &&
      checkType(options, 'object', false)
  },

  validatePing: function validatePing (synced) {
    return checkType(synced, 'number', true)
  },

  validatePong: function validatePong (synced) {
    return checkType(synced, 'number', true)
  },

  validateSync: function validateSync (added) {
    if (!checkType(added, 'number', true)) {
      return false
    }

    if (arguments.length % 2 !== 1) {
      return false
    }

    for (var i = 1; i < arguments.length; i++) {
      var type = (i % 2 === 0 ? 'array' : 'object')
      if (!checkType(arguments[i], type, true)) {
        return false
      }
    }

    return true
  },

  validateSynced: function validateSynced (synced) {
    return checkType(synced, 'number', true)
  },

  validateError: function validateError (type) {
    return checkType(type, 'string', true)
  },

  wrongFormatError: function wrongFormatError (msg) {
    this.sendError(
      new SyncError(this, 'wrong-format', JSON.stringify(msg))
    )
    this.connection.disconnect()
  }
}
