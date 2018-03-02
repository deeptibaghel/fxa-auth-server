/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'

const ROOT_DIR = '../..'

const assert = require('insist')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const {mockLog} = require('../mocks')
const mockConfig = {
  pushboxUrl: 'https://foo.bar:443'
}
const mockDeviceIds = ['bogusid1', 'bogusid2', 'bogusid3']
const mockData = 'eyJmb28iOiAiYmFyIn0'
const mockService = 'sendtab'
const mockTTL = '123'
const mockToken = '558f9980ad5a9c279beb52123653967342f702e84d3ab34c7f80427a6a37e2c0'
const mockUid = 'deadbeef'
const pushboxModulePath = `${ROOT_DIR}/lib/pushbox`

describe('pushbox', () => {

  it(
    'sendTab calls store',
    () => {
      const pushbox = require(pushboxModulePath)(mockLog(), mockConfig)
      sinon.spy(pushbox, 'store')

      return pushbox.sendTab(mockUid, mockDeviceIds, mockData, mockToken)
        .then(() => {
          assert.equal(pushbox.store.callCount, 1, 'pushbox.sendTab was called')
          const args = pushbox.store.args[0]
          assert.equal(args.length, 6)
          assert.equal(args[0], mockUid)
          assert.deepEqual(args[1], mockDeviceIds)
          assert.equal(args[2], 'sendtab')
          assert.equal(args[3], mockData)
          assert.equal(args[4], 30 * 24 * 3600) // = pushbox.js#SEND_TAB_TTL
          assert.equal(args[5], mockToken)
          pushbox.store.restore()
        })
    }
  )

  it(
    'store calls storeForDevice for each device',
    () => {
      const pushbox = require(pushboxModulePath)(mockLog(), mockConfig)
      let i = 0
      sinon.stub(pushbox, 'storeForDevice', () => {
        // We'll fail every other request.
        return i++ % 2 ? Promise.resolve({index: 'yay'}) :
                         Promise.reject({error: 'boom'})
      })

      return pushbox.store(mockUid, mockDeviceIds, mockService, mockData, mockTTL, mockToken)
        .then(responses => {
          assert.equal(pushbox.storeForDevice.callCount, 3, 'pushbox.storeForDevice was called 3 times')
          for (let i = 0; i < 3; i++) {
            const args = pushbox.storeForDevice.args[i]
            assert.equal(args.length, 6)
            assert.equal(args[0], mockUid)
            assert.deepEqual(args[1], mockDeviceIds[i])
            assert.equal(args[2], mockService)
            assert.equal(args[3], mockData)
            assert.equal(args[4], mockTTL)
            assert.equal(args[5], mockToken)
          }
          for (const v of responses.values()) {
            assert.ok('index' in v || 'error' in v)
          }
          pushbox.storeForDevice.restore()
        })
    }
  )

  it(
    'storeForDevice',
    () => {
      const FakePool = function() {}
      const postSpy = sinon.spy(() => Promise.resolve({index: 'yay'}))
      FakePool.prototype.post = postSpy
      const mocks = {
        './pool': FakePool
      }
      const pushbox = proxyquire(pushboxModulePath, mocks)(mockLog(), mockConfig)
      sinon.spy(pushbox, 'store')

      return pushbox.storeForDevice(mockUid, mockDeviceIds[0], mockService, mockData, mockTTL, mockToken)
        .then(() => {
          assert.equal(postSpy.callCount, 1, 'post request was made')
          const args = postSpy.args[0]
          assert.equal(args.length, 3)
          assert.equal(args[0], `/dev/v1/store/${mockService}/${mockUid}/${mockDeviceIds[0]}`)
          assert.deepEqual(args[1], {data: mockData, ttl: mockTTL})
          assert.deepEqual(args[2], {Authorization: `Bearer ${mockToken}`})
        })
    }
  )

})
