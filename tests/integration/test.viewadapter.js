'use strict';

var adapters = ['local'];

adapters.forEach(function (adapter) {
  describe('test.viewadapter.js-' + adapter, function () {
    var dbs = {};

    // beforeEach(function () {
    //   dbs.name = testUtils.adapterUrl(adapter, 'testdb');
    // });

    // afterEach(function (done) {
    //   testUtils.cleanup([dbs.name], done);
    // });

    it('Create a pouch with separate view adapters', async function () {
      /* jshint newcap:false */
      var db = new PouchDB('mydb', {adapter: 'idb', view_adapter: 'memory'});
      console.log('*** *** db', db);
      db.should.be.an.instanceof(PouchDB);
      await db.bulkDocs([
        {title : 'abc', value: 1, _id: 'doc1'},
        {title : 'ghi', value: 3, _id: 'doc3'},
        {title : 'def', value: 2, _id: 'doc2'}
      ]);
    
      const ddoc = {
        _id: '_design/index',
        views: {
          index: {
            map: function mapFun(doc) {
              if (doc.title) {
                emit(doc.title);
              }
            }.toString()
          }
        }
      }
      await db.put(ddoc)
    
      const queryResponse = await db.query('index', {
        key: 'abc',
        include_docs: true
      });
      console.log('*** *** queryResponse', queryResponse)

      for (const key in localStorage) {
        console.log(`${key}: ${localStorage.getItem(key)}`);
      }

      // var request = indexedDB.open("_pouch_mydb", 1);
      // TODO: get the db name from the code rather than hard coding it
      var request = indexedDB.open("_pouch_mydb-mrview-7739afc9b2763c606dec8521f7534fa7", 1);
      request.onupgradeneeded = function(event) {
        console.log('idb event', event)
        // this means that a new mrview database was created in IndexDB.
        // TODO: add better explanation
        event.oldVersion.should.equal(0)
        event.newVersion.should.equal(1)
      };

      // TODO: add a second test without the view adapter and show that both data and view index is saved in the same db
      // TODO: (optional) add tests for other view adapters
    });
  });
});
