var NanoEvents = require('nanoevents')
var assign = require('object-assign')

var SyncError = require('./sync-error')

var connectMessages = require('./messages/connect')
var errorMessages = require('./messages/error')
var pingMessages = require('./messages/ping')
var syncMessages = require('./messages/sync')

var validator = require('./validator')

var BEFORE_AUTH = ['connect', 'connected', 'error']

function syncMappedEvent (sync, event, meta) {
  if (sync.options.outMap) {
    sync.options.outMap(event, meta).then(function (changed) {
      sync.sendSync(changed[0], changed[1])
    })
  } else {
    sync.sendSync(event, meta)
  }
}

/**
 * Base methods for synchronization nodes. Client and server nodes
 * are based on this module.
 *
 * @param {string|number} nodeId Unique current machine name.
 * @param {Log} log Logux log instance to sync with other node log.
 * @param {Connection} connection Connection to other node.
 * @param {object} [options] Synchronization options.
 * @param {object} [options.credentials] Client credentials.
 *                                       For example, access token.
 * @param {authCallback} [options.auth] Function to check client credentials.
 * @param {boolean} [options.fixTime=false] Detect difference between client
 *                                          and server and fix time
 *                                          in synchronized events.
 * @param {number} [options.timeout=0] Timeout in milliseconds to wait answer
 *                                     before disconnect.
 * @param {number} [options.ping=0] Milliseconds since last message to test
 *                                  connection by sending ping.
 * @param {filter} [options.inFilter] Function to filter events
 *                                    from other node. Best place
 *                                    for access control.
 * @param {mapper} [options.inMap] Map function to change other node’s event
 *                                 before put it to current log.
 * @param {filter} [options.outFilter] Filter function to select events
 *                                     to synchronization.
 * @param {mapper} [options.outMap] Map function to change event
 *                                  before sending it to other client.
 * @param {number} [options.synced=0] Events with lower `added` number
 *                                    in current log will not be synchronized.
 * @param {number} [options.otherSynced=0] Events with lower `added` number
 *                                         in other node’s log
 *                                         will not be synchronized.
 * @param {string} [options.subprotocol] Application subprotocol version
 *                                       in SemVer format.
 *
 * @abstract
 * @class
 */
function BaseSync (nodeId, log, connection, options) {
  /**
   * Unique current machine name.
   * @type {string|number}
   *
   * @example
   * console.log(sync.nodeId + ' is started')
   */
  this.nodeId = nodeId
  /**
   * Log for synchronization.
   * @type {Log}
   */
  this.log = log
  /**
   * Connection used to communicate to other node.
   * @type {Connection}
   */
  this.connection = connection
  /**
   * Synchronization options.
   * @type {object}
   */
  this.options = options || { }

  if (this.options.ping && !this.options.timeout) {
    throw new Error('You must set timeout option to use ping')
  }

  /**
   * Is synchronization in process.
   * @type {boolean}
   *
   * @example
   * sync.on('disconnect', () => {
   *   sync.connected //=> false
   * })
   */
  this.connected = false

  /**
   * Did other node finish authenticated.
   * @type {boolean}
   */
  this.authenticated = false
  this.authenticating = false
  this.unauthenticated = []

  this.timeFix = 0
  this.syncing = 0
  this.received = { }

  /**
   * Latest current log `added` time, which was successfully synchronized.
   * You can remember this option too for faster synchronization
   * on next connection.
   * @type {number}
   */
  this.synced = this.options.synced || 0
  /**
   * Latest other node’s log `added` time, which was successfully synchronized.
   * You can remember this option too for faster synchronization
   * on next connection.
   * @type {number}
   */
  this.otherSynced = this.options.otherSynced || 0

  /**
   * Current synchronization state.
   *
   * * `disconnected`: no connection, but no new events to synchronization.
   * * `wait`: new events for synchronization but there is no connection.
   * * `connecting`: connection was established and we wait for node answer.
   * * `sending`: new events was sent, waiting for answer.
   * * `synchronized`: all events was synchronized and we keep connection.
   *
   * @type {"disconnected"|"wait"|"connecting"|"sending"|"synchronized"}
   *
   * @example
   * sync.on('state', () => {
   *   if (sync.state === 'wait' && sync.state === 'sending') {
   *     console.log('Do not close browser')
   *   }
   * })
   */
  this.state = 'disconnected'
  if (this.log.lastAdded > this.synced) this.state = 'wait'

  this.emitter = new NanoEvents()
  this.timeouts = []
  this.throwsError = true

  this.unbind = []
  var sync = this
  this.unbind.push(log.on('event', function (event, meta) {
    sync.onEvent(event, meta)
  }))
  this.unbind.push(connection.on('connecting', function () {
    sync.onConnecting()
  }))
  this.unbind.push(connection.on('connect', function () {
    sync.onConnect()
  }))
  this.unbind.push(connection.on('message', function (message) {
    sync.onMessage(message)
  }))
  this.unbind.push(connection.on('error', function (error) {
    if (error.message === 'Wrong message format') {
      sync.sendError(new SyncError(sync, 'wrong-format', error.received))
    } else {
      sync.emitter.emit('error', error)
    }
    sync.connection.disconnect()
  }))
  this.unbind.push(connection.on('disconnect', function () {
    sync.onDisconnect()
  }))

  if (this.connection.connected) {
    this.onConnect()
  }
}

BaseSync.prototype = {

  /**
   * Unique name of other machine.
   * It is undefined until nodes handshake.
   *
   * @type {string|number|undefined}
   *
   * @example
   * console.log('Connected to ' + sync.otherNodeId)
   */
  otherNodeId: undefined,

  /**
   * Array with major and minor versions of other node protocol.
   * @type {Version|undefined}
   *
   * @example
   * if (sync.otherProtocol[1] >= 5) {
   *   useNewAPI()
   * } else {
   *   useOldAPI()
   * }
   */
  otherProtocol: undefined,

  /**
   * Array with major and minor versions of used protocol.
   * @type {Version}
   *
   * @example
   * if (tool.sync.protocol[0] !== 1) {
   *   throw new Error('Unsupported Logux protocol')
   * }
   */
  protocol: [0, 1],

  /**
   * Other node’s application subprotocol version in SemVer format.
   *
   * It is undefined until nodes handshake. If other node will not send
   * on handshake its subprotocol, it will be set to `0.0.0`.
   *
   * @type {string|undefined}
   *
   * @example
   * if (semver.satisfies(sync.otherSubprotocol, '>= 5.0.0') {
   *   useNewAPI()
   * } else {
   *   useOldAPI()
   * }
   */
  otherSubprotocol: undefined,

  /**
   * Subscribe for synchronization events. It implements nanoevents API.
   * Supported events:
   *
   * * `synced`: `synced` or `otherSynced` was property changed.
   * * `state`: synchronization state was changed.
   * * `connect`: custom check before node authentication. You can throw
   *              a {@link SyncError} to send error to other node.
   * * `clientError`: when error was sent to other node.
   *
   * @param {"synced"|"state"|"connect"|"clientError"} event The event name.
   * @param {listener} listener The listener function.
   *
   * @return {function} Unbind listener from event.
   *
   * @example
   * sync.on('clientError', error => {
   *   logError(error)
   * })
   */
  on: function on (event, listener) {
    return this.emitter.on(event, listener)
  },

  /**
   * Add one-time listener for synchronization events.
   * See {@link BaseSync#on} for supported events.
   *
   * @param {"synced"|"state"|"connect"|"clientError"} event The event name.
   * @param {listener} listener The listener function.
   *
   * @return {function} Unbind listener from event.
   *
   * @example
   * sync.once('clientError', () => {
   *   everythingFine = false
   * })
   */
  once: function once (event, listener) {
    return this.emitter.once(event, listener)
  },

  /**
   * Disable throwing a error on error message and create error listener.
   *
   * @param {errorListener} listener The listener function.
   *
   * @return {undefined}
   *
   * @example
   * sync.catch(error => {
   *   console.error(error)
   * })
   */
  catch: function (listener) {
    this.throwsError = false
    this.on('error', listener)
  },

  /**
   * Shut down the connection and unsubscribe from log events.
   *
   * @return {undefined}
   *
   * @example
   * connection.on('disconnect', () => {
   *   server.destroy()
   * })
   */
  destroy: function destroy () {
    if (this.connection.destroy) {
      this.connection.destroy()
    } else if (this.connected) {
      this.connection.disconnect()
    }
    for (var i = 0; i < this.unbind.length; i++) {
      this.unbind[i]()
    }
  },

  send: function send (msg) {
    if (this.connected) {
      this.delayPing()
      this.connection.send(msg)
    } else {
      var json = JSON.stringify(msg)
      throw new Error('Could not send ' + json + ' to disconnected connection')
    }
  },

  onConnecting: function onConnecting () {
    this.setState('connecting')
  },

  onConnect: function onConnect () {
    this.delayPing()
    this.connected = true
  },

  onDisconnect: function onDisconnect () {
    this.endTimeout()
    if (this.pingTimeout) clearTimeout(this.pingTimeout)
    this.connected = false

    if (this.log.lastAdded > this.synced) {
      this.setState('wait')
    } else {
      this.setState('disconnected')
    }
  },

  onMessage: function onMessage (msg) {
    this.delayPing()

    if (!this.validateMessage(msg)) {
      return
    }

    var name = msg[0]
    var method = name + 'Message'

    if (!this.authenticated && BEFORE_AUTH.indexOf(name) === -1) {
      if (this.authenticating) {
        this.unauthenticated.push(msg)
      } else {
        this.sendError(new SyncError(this, 'missed-auth', JSON.stringify(msg)))
      }
      return
    }

    var args = new Array(msg.length - 1)
    for (var i = 1; i < msg.length; i++) {
      args[i - 1] = msg[i]
    }
    this[method].apply(this, args)
  },

  onEvent: function onEvent (event, meta) {
    if (!this.connected) {
      this.setState('wait')
      return
    }
    if (this.received[meta.added]) {
      delete this.received[meta.added]
      return
    }
    if (this.options.outFilter) {
      var sync = this
      this.options.outFilter(event, meta).then(function (result) {
        if (result) syncMappedEvent(sync, event, meta)
      })
    } else {
      syncMappedEvent(this, event, meta)
    }
  },

  error: function error (type, options, received) {
    var err = new SyncError(this, type, options, received)
    this.emitter.emit('error', err)
    if (this.throwsError) {
      throw err
    }
  },

  setState: function setState (state) {
    if (this.state !== state) {
      this.state = state
      this.emitter.emit('state')
    }
  },

  startTimeout: function startTimeout () {
    if (!this.options.timeout) return

    var ms = this.options.timeout
    var sync = this
    var timeout = setTimeout(function () {
      if (sync.connected) sync.connection.disconnect('timeout')
      sync.error('timeout', ms)
    }, ms)

    this.timeouts.push(timeout)
  },

  endTimeout: function endTimeout () {
    if (this.timeouts.length > 0) {
      clearTimeout(this.timeouts.shift())
    }
  },

  delayPing: function delayPing () {
    if (!this.options.ping) return
    if (this.pingTimeout) clearTimeout(this.pingTimeout)

    var sync = this
    this.pingTimeout = setTimeout(function () {
      if (sync.connected) sync.sendPing()
    }, this.options.ping)
  },

  syncSince: function syncSince (lastSynced) {
    var data = []
    var sync = this
    this.log.each({ order: 'added' }, function (event, meta) {
      if (meta.added <= lastSynced) {
        return false
      } else {
        data.push(event, meta)
        return true
      }
    }).then(function () {
      if (!sync.connected) return
      if (data.length > 0) {
        sync.sendSync.apply(sync, data)
      } else {
        sync.setState('synchronized')
      }
    })
  },

  setSynced: function setSynced (value) {
    if (this.synced < value) this.synced = value
    this.emitter.emit('synced')
  },

  setOtherSynced: function setOtherSynced (value) {
    if (this.otherSynced < value) this.otherSynced = value
    this.emitter.emit('synced')
  }

}

BaseSync.prototype = assign(BaseSync.prototype,
  errorMessages, connectMessages, pingMessages, syncMessages, validator)

module.exports = BaseSync

/**
 * Logux protocol version.
 *
 * @typedef {number[]} Version
 */

/**
 * @callback errorListener
 * @param {string} error The error description.
 */

/**
 * @callback authCallback
 * @param {object} credentials Other credentials.
 * @param {string} nodeId Unique name of other sync instance.
 * @return {Promise} Promise with boolean value.
 */

/**
 * @callback filter
 * @param {Event} event New event from log.
 * @param {Meta} meta New event metadata.
 * @return {Promise} Promise with `true` if event be synchronized
 *                   with other log.
 */

/**
 * @callback mapper
 * @param {Event} event New event from log.
 * @param {Meta} meta New event metadata.
 * @return {Promise} Promise with array of changed event and changed metadata.
 */
