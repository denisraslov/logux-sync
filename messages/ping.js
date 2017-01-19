module.exports = {

  sendPing: function sendPing () {
    this.startTimeout()
    this.send(['ping', this.log.lastAdded])
    if (this.pingTimeout) clearTimeout(this.pingTimeout)
  },

  pingMessage: function pingMessage (synced) {
    if (!this.validatePing(synced)) {
      this.wrongFormatError(['ping', synced])
      return
    }

    this.setOtherSynced(synced)
    this.send(['pong', this.log.lastAdded])
  },

  pongMessage: function pongMessage (synced) {
    if (!this.validatePong(synced)) {
      this.wrongFormatError(['pong', synced])
      return
    }

    this.setOtherSynced(synced)
    this.endTimeout()
  }

}
