var TypeChecker = require('../type-checker')
var SyncError = require('../sync-error')

module.exports = {

  sendPing: function sendPing () {
    this.startTimeout()
    this.send(['ping', this.log.lastAdded])
    if (this.pingTimeout) clearTimeout(this.pingTimeout)
  },

  pingMessage: function pingMessage (synced) {
    if (!TypeChecker.checkType(synced, 'number', true)) {
      this.sendError(
        new SyncError(this, 'wrong-format', JSON.stringify(['ping', synced]))
      )
      this.connection.disconnect()
      return
    }

    this.setOtherSynced(synced)
    this.send(['pong', this.log.lastAdded])
  },

  pongMessage: function pongMessage (synced) {
    if (!TypeChecker.checkType(synced, 'number', true)) {
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
