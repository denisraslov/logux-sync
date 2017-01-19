var TypeChecker = require('../type-checker')
var SyncError = require('../sync-error')

function auth (sync, nodeId, credentials, callback) {
  if (!sync.options.auth) {
    sync.authenticated = true
    callback()
    return
  }

  sync.authenticating = true
  sync.options.auth(credentials, nodeId).then(function (access) {
    if (access) {
      sync.authenticated = true
      sync.authenticating = false

      callback()
      for (var i = 0; i < sync.unauthenticated.length; i++) {
        sync.onMessage(sync.unauthenticated[i])
      }
      sync.unauthenticated = []
    } else {
      sync.sendError(new SyncError(sync, 'wrong-credentials'))
      sync.destroy()
    }
  })
}

function emitEvent (sync) {
  try {
    sync.emitter.emit('connect')
  } catch (e) {
    if (e.name === 'SyncError') {
      sync.sendError(e)
      return false
    } else {
      throw e
    }
  }
  return true
}

module.exports = {

  sendConnect: function sendConnect () {
    var message = ['connect', this.protocol, this.nodeId, this.otherSynced]

    var options = { }
    if (this.options.credentials) {
      options.credentials = this.options.credentials
    }
    if (this.options.subprotocol) {
      options.subprotocol = this.options.subprotocol
    }
    if (Object.keys(options).length > 0) message.push(options)

    if (this.options.fixTime) this.connectSended = this.log.timer()[0]
    if (this.log.lastAdded > this.synced) this.setState('sending')
    this.startTimeout()
    this.send(message)
  },

  sendConnected: function sendConnected (start, end) {
    var message = ['connected', this.protocol, this.nodeId, [start, end]]

    var options = { }
    if (this.options.credentials) {
      options.credentials = this.options.credentials
    }
    if (this.options.subprotocol) {
      options.subprotocol = this.options.subprotocol
    }
    if (Object.keys(options).length > 0) message.push(options)

    this.send(message)
  },

  validateConnect: function validateConnect (ver, nodeId, synced, options) {
    return TypeChecker.checkType(nodeId, 'string', true) &&
      TypeChecker.checkType(synced, 'number', true) &&
      TypeChecker.checkType(options, 'object', false)
  },

  connectMessage: function connectMessage (ver, nodeId, synced, options) {
    var isValid = this.validateConnect(ver, nodeId, synced, options)

    if (!isValid) {
      var msg = JSON.stringify(['connect', ver, nodeId, synced, options])
      this.sendError(new SyncError(this, 'wrong-format', msg))
      this.connection.disconnect()
      return
    }

    var start = this.log.timer()[0]
    if (!options) options = { }

    this.otherProtocol = ver
    this.otherNodeId = nodeId

    var major = this.protocol[0]
    if (major !== ver[0]) {
      this.sendError(new SyncError(this, 'wrong-protocol', {
        supported: [major], used: ver
      }))
      this.destroy()
      return
    }

    this.otherSubprotocol = options.subprotocol || '0.0.0'

    if (!emitEvent(this)) {
      this.destroy()
      return
    }

    var sync = this
    auth(this, nodeId, options.credentials, function () {
      sync.sendConnected(start, sync.log.timer()[0])
      sync.syncSince(synced)
    })
  },

  validateConnected: function validateConnected (ver, nodeId, time, options) {
    return TypeChecker.checkType(nodeId, 'string', true) &&
      TypeChecker.checkType(time, 'array', true) && time.length === 2 &&
      TypeChecker.checkType(time[0], 'number', true) &&
      TypeChecker.checkType(time[1], 'number', true) &&
      TypeChecker.checkType(options, 'object', false)
  },

  connectedMessage: function connectedMessage (ver, nodeId, time, options) {
    var isValid = this.validateConnected(ver, nodeId, time, options)

    if (!isValid) {
      var msg = JSON.stringify(['connected', ver, nodeId, time, options])
      this.sendError(new SyncError(this, 'wrong-format', msg))
      this.connection.disconnect()
      return
    }

    if (!options) options = { }

    this.endTimeout()
    this.otherProtocol = ver
    this.otherNodeId = nodeId

    if (this.options.fixTime) {
      var now = this.log.timer()[0]
      var authTime = time[1] - time[0]
      var roundTrip = now - this.connectSended - authTime
      this.timeFix = this.connectSended - time[0] + roundTrip / 2
    }

    this.otherSubprotocol = options.subprotocol || '0.0.0'

    if (!emitEvent(this)) {
      this.destroy()
      return
    }

    var sync = this
    auth(this, nodeId, options.credentials, function () {
      sync.syncSince(sync.synced)
    })
  }

}
