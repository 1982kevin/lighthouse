/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Gatherer = require('./gatherer.js');

class UnloadListeners extends Gatherer {
  /**
   * @param {LH.Crdp.DOMDebugger.EventListener} listener
   * @return {listener is {type: 'pagehide'|'unload'|'visibilitychange'} & LH.Crdp.DOMDebugger.EventListener}
   */
  static _filterForUnloadTypes(listener) {
    return listener.type === 'pagehide' ||
      listener.type === 'unload' ||
      listener.type === 'visibilitychange';
  }

  /**
   * @param {LH.Gatherer.PassContext} passContext
   * @return {Promise<LH.Artifacts['UnloadListeners']>}
   */
  async afterPass(passContext) {
    const driver = passContext.driver;

    // Get a RemoteObject handle to `window`.
    const {result: {objectId}} = await driver.sendCommand('Runtime.evaluate', {
      expression: 'window',
      returnByValue: false,
    });
    if (!objectId) {
      throw new Error('Error fetching information about the global object');
    }

    // And get all its unload-ish listeners.
    const {listeners} = await driver.sendCommand('DOMDebugger.getEventListeners', {objectId});
    return listeners
      .filter(UnloadListeners._filterForUnloadTypes)
      .map(listener => {
        const {type, scriptId, lineNumber} = listener;
        return {
          type,
          scriptId,
          lineNumber,
        };
      });
  }
}

module.exports = UnloadListeners;
