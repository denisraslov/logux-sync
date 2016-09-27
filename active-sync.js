var assign = require('object-assign')

var BaseSync = require('./base-sync')

/**
 * Active node in synchronization pair.
 *
 * Instead of passive node, it initializes synchronization,
 * remembers synchronization state.
 *
 * For example, active sync is used for browser clients and passive for servers.
 *
 * @param {string} host Unique current host name.
 * @param {Log} log Logux log instance to sync with other node log.
 * @param {Connection} connection Connection to other node.
 * @param {object} [options] Synchronization options.
 * @param {object} [option.credentials] This sync node credentials.
 *                                      For example, access token.
 * @param {authCallback} [option.auth] Function to check
 *                                     other node credentials.
 *
 * @example
 * import { ActiveSync } from 'logux-sync'
 * const connection = new WebSocketsConnection(destination)
 * const sync = new ActiveSync('user' + id, log, connection)
 *
 * @extends BaseSync
 * @class
 */
function ActiveSync (host, log, connection, options) {
  BaseSync.call(this, host, log, connection, options)
}

ActiveSync.prototype = {

  onConnect: function onConnect () {
    BaseSync.prototype.onConnect.call(this)
    this.sendConnect()
  }

}

ActiveSync.prototype = assign({ }, BaseSync.prototype, ActiveSync.prototype)

module.exports = ActiveSync