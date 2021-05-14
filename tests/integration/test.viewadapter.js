'use strict';

var adapters = ['local'];

adapters.forEach(function (adapter) {
  describe('test.viewadapter.js-' + adapter, function () {
    var db = {};
    // TODO: need to add cleanup function and remove db.destroy from tests
    // afterEach(function (done) {
    //   db.destroy()
    // });

    var docs = [
      {title : 'abc', value: 1, _id: 'doc1'},
      {title : 'ghi', value: 3, _id: 'doc3'},
      {title : 'def', value: 2, _id: 'doc2'}
    ]

    var ddoc = {
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


    it('Create pouch with separate view adapters', async function () {
      /* jshint newcap:false */
      var db = new PouchDB('mydb', {adapter: 'idb', view_adapter: 'memory'});
      await db.bulkDocs(docs);
      await db.put(ddoc);
    
      await db.query('index', {
        key: 'abc',
        include_docs: true
      });

      // This is the name of the db where view index data is stored.
      var localStorageKeys = Object.keys(localStorage)
      var viewDbName = localStorageKeys[localStorageKeys.length - 1]

      var request = indexedDB.open(`_pouch_${viewDbName}`, 1);

      request.onupgradeneeded = function(event) {

        // The version of the view database created is 1 which shows that this
        // database was newly created in IndexedDB and did not exist there
        // before. So the view database was created in the database specified in
        // the view_adapter and not in the default `idb`adapter. 

        event.oldVersion.should.equal(0)
        event.newVersion.should.equal(1)
      };
      await db.destroy()
    });

    it('Create pouch with no view adapters', async function () {
      /* jshint newcap:false */
      var db = new PouchDB('mydb', {adapter: 'idb'});
      db.should.be.an.instanceof(PouchDB);
      await db.bulkDocs(docs);
      await db.put(ddoc);
    
      await db.query('index', {
        key: 'abc',
        include_docs: true
      });

      // This is the name of the db where view index data is stored.
      var localStorageKeys = Object.keys(localStorage)
      var viewDbName = localStorageKeys[localStorageKeys.length - 1]

      var request = indexedDB.open(`_pouch_${viewDbName}`, 1)

      request.onupgradeneeded = function(event) {
        // TODO: add comment explaining the process
        event.oldVersion.should.not.equal(0)
        event.oldVersion.should.equal(1)
        event.newVersion.should.not.equal(1)
        event.newVersion.should.equal(2)
      };

      await db.destroy()
    });
  });
});
