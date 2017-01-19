var TypeChecker = require('../type-checker')
var SyncError = require('../sync-error')

module.exports = {

  sendPing: function sendPing () {
    this.startTimeout()
    this.send(['ping', this.log.lastAdded])
    if (this.pingTimeout) clearTimeout(this.pingTimeout)
  },

  validatePing: function validatePing (synced) {
    return TypeChecker.checkType(synced, 'number', true)
  },

  pingMessage: function pingMessage (synced) {
    if (!this.validatePing(synced)) {
      this.sendError(
        new SyncError(this, 'wrong-format', JSON.stringify(['ping', synced]))
      )
      this.connection.disconnect()
      return
    }

    this.setOtherSynced(synced)
    this.send(['pong', this.log.lastAdded])
  },

  validatePong: function validatePong (synced) {
    return TypeChecker.checkType(synced, 'number', true)
  },

  pongMessage: function pongMessage (synced) {
    if (!this.validatePong(synced)) {
      this.sendError(
        new SyncError(this, 'wrong-format', JSON.stringify(['pong', synced]))
      )
      this.connection.disconnect()
      return
    }

    this.setOtherSynced(synced)
    this.endTimeout()
  }

}
