'use strict';

var adapters = ['local'];

adapters.forEach(function (adapter) {
  describe('test.viewadapter.js-' + adapter, function () {
    var dbs = {};

    var docs = [
      {title : 'abc', value: 1, _id: 'doc1'},
      {title : 'def', value: 2, _id: 'doc2'}
    ];

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
    };

    function getDBNames(localStorage) {
      var savedDbNames = Object.keys(localStorage).filter(function (key) {
        return key.includes(dbs.name);
      });

      // This is the name of the db where view index data is stored.
      var viewDbName = savedDbNames.find(function (dbName) {
        return dbName.includes('-mrview-');
      });
      // This is the name of the db where documents are stored.
      var docDbName = savedDbNames.find(function (dbName) {
        return !dbName.includes('-mrview-');
      });
      return { viewDbName, docDbName };
    }

    beforeEach(function () {
      dbs.name = testUtils.adapterUrl(adapter, 'testdb');
    });

    afterEach(function (done) {
      testUtils.cleanup([dbs.name], done);
    });

    it('Create pouch with separate view adapters', function (done) {
      var db = new PouchDB(dbs.name, {adapter: 'idb', view_adapter: 'memory'});

      db.bulkDocs(docs).then(function () {
        db.put(ddoc).then(function () {
          db.query('index', {
            key: 'abc',
            include_docs: true
          }).then(function () {

            var { viewDbName, docDbName } = getDBNames(localStorage);

            // check indexedDB for saved views
            // need to add '_pouch_' because views are saved in memory
            var viewRequest = indexedDB.open('_pouch_' + viewDbName, 1);
            viewRequest.onupgradeneeded = function (event) {
              // The version of the view database created is 1 which shows that this
              // database was newly created in IndexedDB and did not exist there
              // before. So the view database was created in the database specified in
              // the view_adapter and not in the default `idb`adapter.
              event.oldVersion.should.equal(0);
              event.newVersion.should.equal(1);
            };

            viewRequest.onsuccess = function () {
              // Nothing is saved here
              viewRequest.result.objectStoreNames.length.should.equal(0);
              viewRequest.result.version.should.equal(1);
            };

            // check indexedDB for saved docs
            var docRequest = indexedDB.open(docDbName, 5);
            docRequest.onsuccess = function () {
              // something is saved here
              docRequest.result.objectStoreNames.length.should.equal(7);
              done();
            };
          });
        });
      });
    });

    it('Create pouch with no view adapters', function (done) {
      var db = new PouchDB(dbs.name, {adapter: 'idb'});

      db.bulkDocs(docs).then(function () {
        db.put(ddoc).then(function () {
          db.query('index', {
            key: 'abc',
            include_docs: true
          }).then(function () {

            var { viewDbName, docDbName } = getDBNames(localStorage);

            // check indexedDB for saved views
            var viewRequest = indexedDB.open(viewDbName, 5);
            viewRequest.onsuccess = function () {
              // Something is saved here
              viewRequest.result.objectStoreNames.length.should.equal(7);
            };

            // check indexedDB for saved docs
            var docRequest = indexedDB.open(docDbName, 5);
            docRequest.onsuccess = function () {
              // something is saved here
              docRequest.result.objectStoreNames.length.should.equal(7);
              done();
            };
          });
        });
      });
    });
  });
});
