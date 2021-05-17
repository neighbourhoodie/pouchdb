'use strict';

var adapters = ['local'];

adapters.forEach(function (adapter) {
  describe('test.viewadapter.js-' + adapter, function () {
    var dbs = {};

    var docs = [
      {title : 'abc', value: 1, _id: 'doc1'},
      {title : 'ghi', value: 3, _id: 'doc3'},
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

    beforeEach(function () {
      dbs.name = testUtils.adapterUrl(adapter, 'testdb');
    });

    afterEach(function (done) {
      testUtils.cleanup([dbs.name], done);
    });

    it('Create pouch with separate view adapters', function (done) {
      var db = new PouchDB(dbs.name, {adapter: 'idb', view_adapter: 'memory'});
      db.should.be.an.instanceof(PouchDB);
      db.bulkDocs(docs).then(function () {
        db.put(ddoc).then(function () {
          db.query('index', {
            key: 'abc',
            include_docs: true
          }).then(function () {
            // This is the name of the db where view index data is stored.
            var viewDbName = Object.keys(localStorage).find(function (key) {
              return key.startsWith('_pouch_' + db.name + '-mrview-');
            });
            var request = indexedDB.open(viewDbName, 1);
            request.onupgradeneeded = function (event) {
              // The version of the view database created is 1 which shows that this
              // database was newly created in IndexedDB and did not exist there
              // before. So the view database was created in the database specified in
              // the view_adapter and not in the default `idb`adapter.
              event.oldVersion.should.equal(0);
              event.newVersion.should.equal(1);
              done();
            };
          });
        });
      });
    });

    it('Create pouch with no view adapters', function (done) {
      var db = new PouchDB(dbs.name, {adapter: 'idb'});
      db.should.be.an.instanceof(PouchDB);
      db.bulkDocs(docs).then(function () {
        db.put(ddoc).then(function () {
          db.query('index', {
            key: 'abc',
            include_docs: true
          }).then(function () {
            // This is the name of the db where view index data is stored.
            var viewDbName = Object.keys(localStorage).find(function (key) {
              return key.startsWith('_pouch_' + db.name + '-mrview-');
            })

            var request = indexedDB.open(viewDbName, 1);
            // triggers if the client had no database
            request.onupgradeneeded = function (event) {
              // TODO: add comment explaining the process
              console.log('event.newVersion', event.newVersion);
              event.oldVersion.should.not.equal(0);
              event.oldVersion.should.equal(1);
              event.newVersion.should.not.equal(1);
              event.newVersion.should.equal(2);
              done();
            };
          });
        });
      });
    });

  });
});
