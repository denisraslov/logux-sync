var TypeChecker = require('../type-checker')
var SyncError = require('../sync-error')

module.exports = {

  sendError: function sendError (error) {
    var message = ['error', error.type]
    if (typeof error.options !== 'undefined') message.push(error.options)
    this.send(message)

    this.emitter.emit('clientError', error)
  },

  validateError: function validateError (type) {
    return TypeChecker.checkType(type, 'string', true)
  },

  errorMessage: function errorMessage (type, options) {
    if (!this.validateError(type, options)) {
      this.sendError(
        new SyncError(this, 'wrong-format',
          JSON.stringify(['error', type, options]))
      )
      this.connection.disconnect()
      return
    }

    this.error(type, options, true)
  }

}
