'use strict';

const fs = require('fs');

const viewAdapters = testUtils.viewAdapters();

viewAdapters.forEach(viewAdapter => {
  describe('test.viewadapter.js-' + 'local' + '-' + viewAdapter, function () {
    var dbs = {};

    var docs = [
      {title : 'abc', value: 1, _id: 'doc1'},
      {title : 'def', value: 2, _id: 'doc2'},
      {
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
    ];

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

    function getDbNamesFromLevelDBFolder(name) {
      const dbs = fs.readdirSync('./tmp');
      return dbs.filter((dbName => dbName.includes(name)));
    }

    beforeEach(function () {
      dbs.name = testUtils.adapterUrl('local', 'testdb');
    });

    afterEach(function (done) {
      testUtils.cleanup([dbs.name], done);
    });

    it('Create pouch with separate view adapters', function (done) {
      var db = new PouchDB(dbs.name, {view_adapter: viewAdapter});

      db.bulkDocs(docs).then(function () {
        db.query('index', {
          key: 'abc',
          include_docs: true
        }).then(function () {

          if (testUtils.isNode()) {
            const dbs = getDbNamesFromLevelDBFolder(db.name);
            dbs.length.should.equal(1); // only one db created on disk, no dependent db created
            done();
          } else {
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
          }
        });
      });
    });

    it('Create pouch with no view adapters', function (done) {
      var db = new PouchDB(dbs.name);

      db.bulkDocs(docs).then(function () {
        db.query('index', {
          key: 'abc',
          include_docs: true
        }).then(function () {

          if (testUtils.isNode()) {
            const dbs = getDbNamesFromLevelDBFolder(db.name);
            dbs.length.should.equal(2); // db and dependent db created
            done();
          } else {
            var { viewDbName, docDbName } = getDBNames(localStorage);

            // check indexedDB for saved views
            var viewRequest = indexedDB.open(viewDbName, 5);
            viewRequest.onsuccess = function () {
              // Something is saved here
              // This shows that without a view_adapter specified
              // the view query data is stored in the default adapter database.
              viewRequest.result.objectStoreNames.length.should.equal(7);
            };

            // check indexedDB for saved docs
            var docRequest = indexedDB.open(docDbName, 5);
            docRequest.onsuccess = function () {
              // something is saved here
              docRequest.result.objectStoreNames.length.should.equal(7);
              done();
            };
          }
        });
      });
    });
  });
});