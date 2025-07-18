/* global sum */
'use strict';

var viewTypes = ['persisted', 'temp'];
viewTypes.forEach(function (viewType) {
  var suiteName = 'test.mapreduce.js-' + viewType;
  var adapter = testUtils.adapterType();
  var dbName = testUtils.adapterUrl(adapter, 'testdb');

  tests(suiteName, dbName, adapter, viewType);
});

function tests(suiteName, dbName, dbType, viewType) {

  describe(suiteName, function () {
    var createView;
    if (dbType === 'http' || viewType === 'persisted') {
      createView = function (db, viewObj) {
        var storableViewObj = {
          map: viewObj.map.toString()
        };
        if (viewObj.reduce) {
          storableViewObj.reduce = viewObj.reduce.toString();
        }
        return new Promise(function (resolve, reject) {
          db.put({
            _id: '_design/theViewDoc',
            views: {
              'theView' : storableViewObj
            }
          }, function (err) {
            if (err) {
              reject(err);
            } else {
              resolve('theViewDoc/theView');
            }
          });
        });
      };
    } else {
      createView = function (db, viewObj) {
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve(viewObj);
          });
        });
      };
    }

    beforeEach(function () {
      if (dbType === 'http') {
        const url = new URL(dbName);
        const dbUrl = `${url.origin}${url.pathname}`;
        return PouchDB.fetch(dbUrl + '?q=1', {
          method: 'PUT',
          headers: { Authorization: 'Basic ' + testUtils.btoa(`${url.username}:${url.password}`) },
        });
      }
    });

    afterEach(function () {
      return new PouchDB(dbName).destroy();
    });

    it("Test basic view", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo, doc);
        }
      }).then(function (view) {
        return db.bulkDocs({docs: [
          {foo: 'bar'},
          { _id: 'volatile', foo: 'baz' }
        ]}).then(function () {
          return db.get('volatile');
        }).then(function (doc) {
          return db.remove(doc);
        }).then(function () {
          return db.query(view, {include_docs: true, reduce: false});
        }).then(function (res) {
          res.rows.should.have.length(1, 'Dont include deleted documents');
          res.total_rows.should.equal(1, 'Include total_rows property.');
          res.rows.forEach(function (x) {
            should.exist(x.id);
            should.exist(x.key);
            should.exist(x.value);
            should.exist(x.value._rev);
            should.exist(x.doc);
            should.exist(x.doc._rev);
          });
        });
      });
    });

    it("Test basic view, no emitted value", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo);
        }
      }).then(function (view) {
        return db.bulkDocs({docs: [
          {foo: 'bar'},
          { _id: 'volatile', foo: 'baz' }
        ]}).then(function () {
          return db.get('volatile');
        }).then(function (doc) {
          return db.remove(doc);
        }).then(function () {
          return db.query(view, {include_docs: true, reduce: false});
        }).then(function (res) {
          res.rows.should.have.length(1,
                                      'Dont include deleted documents');
          res.total_rows.should.equal(1, 'Include total_rows property.');
          res.rows.forEach(function (x) {
            should.exist(x.id);
            should.exist(x.key);
            should.equal(x.value, null);
            should.exist(x.doc);
            should.exist(x.doc._rev);
          });
        });
      });
    });

    if (dbType === 'local' && viewType === 'temp') {
      it("with a closure", function () {
        var db = new PouchDB(dbName);
        return db.bulkDocs({docs: [
          {foo: 'bar'},
          { _id: 'volatile', foo: 'baz' }
        ]}).then(function () {
          var queryFun = (function (test) {
            return function (doc, emit) {
              if (doc._id === test) {
                emit(doc.foo);
              }
            };
          }('volatile'));
          return db.query(queryFun, {reduce: false});
        }).should.become({
          total_rows: 1,
          offset: 0,
          rows: [
            {
              id: 'volatile',
              key: 'baz',
              value: null
            }
          ]
        });
      });
    }
    if (viewType === 'temp' && dbType !== 'http') {

      it('Test simultaneous temp views', function () {
        var db = new PouchDB(dbName);
        return db.put({_id: '0', foo: 1, bar: 2, baz: 3}).then(function () {
          return Promise.all(['foo', 'bar', 'baz'].map(function (key, i) {
            var fun = 'function(doc){emit(doc.' + key + ');}';
            return db.query({map: fun}).then(function (res) {
              res.rows.should.deep.equal([{
                id: '0',
                key: i + 1,
                value: null
              }]);
            });
          }));
        });
      });

      it("Test passing just a function", function () {
        var db = new PouchDB(dbName);
        return db.bulkDocs({docs: [
          {foo: 'bar'},
          { _id: 'volatile', foo: 'baz' }
        ]}).then(function () {
          return db.get('volatile');
        }).then(function (doc) {
          return db.remove(doc);
        }).then(function () {
          return db.query(function (doc) {
            emit(doc.foo, doc);
          }, {include_docs: true, reduce: false});
        }).then(function (res) {
          res.rows.should.have.length(1, 'Dont include deleted documents');
          res.rows.forEach(function (x) {
            should.exist(x.id);
            should.exist(x.key);
            should.exist(x.value);
            should.exist(x.value._rev);
            should.exist(x.doc);
            should.exist(x.doc._rev);
          });
        });
      });
    }

    it("Test opts.startkey/opts.endkey", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.key, doc);
        }
      }).then(function (queryFun) {
        return db.bulkDocs({docs: [
          {key: 'key1'},
          {key: 'key2'},
          {key: 'key3'},
          {key: 'key4'},
          {key: 'key5'}
        ]}).then(function () {
          return db.query(queryFun, {reduce: false, startkey: 'key2'});
        }).then(function (res) {
          res.rows.should.have.length(4, 'Startkey is inclusive');
          return db.query(queryFun, {reduce: false, endkey: 'key3'});
        }).then(function (res) {
          res.rows.should.have.length(3, 'Endkey is inclusive');
          return db.query(queryFun, {
            reduce: false,
            startkey: 'key2',
            endkey: 'key3'
          });
        }).then(function (res) {
          res.rows.should.have.length(2, 'Startkey and endkey together');
          return db.query(queryFun, {
            reduce: false,
            startkey: 'key4',
            endkey: 'key4'
          });
        }).then(function (res) {
          res.rows.should.have.length(1, 'Startkey=endkey');
        });
      });
    });

    it("#4154 opts.start_key/opts.end_key are synonyms", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.key, doc);
        }
      }).then(function (queryFun) {
        return db.bulkDocs({docs: [
          {key: 'key1'},
          {key: 'key2'},
          {key: 'key3'},
          {key: 'key4'},
          {key: 'key5'}
        ]}).then(function () {
          return db.query(queryFun, {reduce: false, start_key: 'key2'});
        }).then(function (res) {
          res.rows.should.have.length(4, 'Startkey is inclusive');
          return db.query(queryFun, {reduce: false, end_key: 'key3'});
        }).then(function (res) {
          res.rows.should.have.length(3, 'Endkey is inclusive');
          return db.query(queryFun, {
            reduce: false,
            start_key: 'key2',
            end_key: 'key3'
          });
        }).then(function (res) {
          res.rows.should.have.length(2, 'Startkey and endkey together');
          return db.query(queryFun, {
            reduce: false,
            start_key: 'key4',
            end_key: 'key4'
          });
        }).then(function (res) {
          res.rows.should.have.length(1, 'Startkey=endkey');
        });
      });
    });

    //TODO: split this to their own tests within a describe block
    it("Test opts.inclusive_end = false", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.key, doc);
        }
      }).then(function (queryFun) {
        return db.bulkDocs({docs: [
          {key: 'key1'},
          {key: 'key2'},
          {key: 'key3'},
          {key: 'key4'},
          {key: 'key4'},
          {key: 'key5'}
        ]}).then(function () {
          return db.query(queryFun, {
            reduce: false,
            endkey: 'key4',
            inclusive_end: false
          });
        }).then(function (resp) {
          resp.rows.should.have.length(3, 'endkey=key4 without ' +
                                       'inclusive end');
          resp.rows[0].key.should.equal('key1');
          resp.rows[2].key.should.equal('key3');
        })
          .then(function () {
            return db.query(queryFun, {
              reduce: false,
              startkey: 'key3',
              endkey: 'key4',
              inclusive_end: false
            });
          }).then(function (resp) {
            resp.rows.should.have.length(1, 'startkey=key3, endkey=key4 ' +
                                         'without inclusive end');
            resp.rows[0].key.should.equal('key3');
          }).then(function () {
            return db.query(queryFun, {
              reduce: false,
              startkey: 'key4',
              endkey: 'key1',
              descending: true,
              inclusive_end: false
            });
          }).then(function (resp) {
            resp.rows.should
              .have.length(4, 'startkey=key4, endkey=key1 descending without ' +
                           'inclusive end');
            resp.rows[0].key.should.equal('key4');
          });
      });
    });

    it("Test opts.key", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.key, doc);
        }
      }).then(function (queryFun) {
        return db.bulkDocs({docs: [
          {key: 'key1'},
          {key: 'key2'},
          {key: 'key3'},
          {key: 'key3'}
        ]}).then(function () {
          return db.query(queryFun, {reduce: false, key: 'key2'});
        }).then(function (res) {
          res.rows.should.have.length(1, 'Doc with key');
          return db.query(queryFun, {reduce: false, key: 'key3'});
        }).then(function (res) {
          res.rows.should.have.length(2, 'Multiple docs with key');
        });
      });
    });

    it("Test basic view collation", function () {

      var values = [];

      // special values sort before all other types
      values.push(null);
      values.push(false);
      values.push(true);

      // then numbers
      values.push(1);
      values.push(2);
      values.push(3.0);
      values.push(4);

      // then text, case sensitive
      // currently chrome uses ascii ordering and so wont handle caps properly
      values.push("a");
      //values.push("A");
      values.push("aa");
      values.push("b");
      //values.push("B");
      values.push("ba");
      values.push("bb");

      // then arrays. compared element by element until different.
      // Longer arrays sort after their prefixes
      values.push(["a"]);
      values.push(["b"]);
      values.push(["b", "c"]);
      values.push(["b", "c", "a"]);
      values.push(["b", "d"]);
      values.push(["b", "d", "e"]);

      // then object, compares each key value in the list until different.
      // larger objects sort after their subset objects.
      values.push({a: 1});
      values.push({a: 2});
      values.push({b: 1});
      values.push({b: 2});
      values.push({b: 2, a: 1}); // Member order does matter for collation.
      // CouchDB preserves member order
      // but doesn't require that clients will.
      // (this test might fail if used with a js engine
      // that doesn't preserve order)
      values.push({b: 2, c: 2});
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo);
        }
      }).then(function (queryFun) {

        var docs = values.map(function (x, i) {
          return {_id: (i).toString(), foo: x};
        });
        return db.bulkDocs({docs}).then(function () {
          return db.query(queryFun, {reduce: false});
        }).then(function (res) {
          res.rows.forEach(function (x, i) {
            JSON.stringify(x.key).should.equal(JSON.stringify(values[i]),
                                               'keys collate');
          });
          return db.query(queryFun, {descending: true, reduce: false});
        }).then(function (res) {
          res.rows.forEach(function (x, i) {
            JSON.stringify(x.key).should.equal(JSON.stringify(
              values[values.length - 1 - i]),
                                               'keys collate descending');
          });
        });
      });
    });

    it('Test complex key collation', function () {
      var map = function () {
        emit(null);
        emit(false);
        emit(true);
        emit(1);
        emit(2);
        emit(3);
        emit(4);
        emit("a");
        emit("aa");
        emit("b");
        emit("ba");
        emit("bb");
        emit(["a"]);
        emit(["b"]);
        emit(["b","c"]);
        emit(["b","c","a"]);
        emit(["b","d"]);
        emit(["b","d","e"]);
        emit({"a":1});
        emit({"a":2});
        emit({"b":1});
        emit({"b":2});
        emit({"b":2,"a":1});
        emit({"b":2,"c":2});
      };
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, { map });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { id: '1', key: null, value: null },
            { id: '2', key: null, value: null },
            { id: '1', key: false, value: null },
            { id: '2', key: false, value: null },
            { id: '1', key: true, value: null },
            { id: '2', key: true, value: null },
            { id: '1', key: 1, value: null },
            { id: '2', key: 1, value: null },
            { id: '1', key: 2, value: null },
            { id: '2', key: 2, value: null },
            { id: '1', key: 3, value: null },
            { id: '2', key: 3, value: null },
            { id: '1', key: 4, value: null },
            { id: '2', key: 4, value: null },
            { id: '1', key: 'a', value: null },
            { id: '2', key: 'a', value: null },
            { id: '1', key: 'aa', value: null },
            { id: '2', key: 'aa', value: null },
            { id: '1', key: 'b', value: null },
            { id: '2', key: 'b', value: null },
            { id: '1', key: 'ba', value: null },
            { id: '2', key: 'ba', value: null },
            { id: '1', key: 'bb', value: null },
            { id: '2', key: 'bb', value: null },
            { id: '1', key: [ 'a' ], value: null },
            { id: '2', key: [ 'a' ], value: null },
            { id: '1', key: [ 'b' ], value: null },
            { id: '2', key: [ 'b' ], value: null },
            { id: '1', key: [ 'b', 'c' ], value: null },
            { id: '2', key: [ 'b', 'c' ], value: null },
            { id: '1', key: [ 'b', 'c', 'a' ], value: null },
            { id: '2', key: [ 'b', 'c', 'a' ], value: null },
            { id: '1', key: [ 'b', 'd' ], value: null },
            { id: '2', key: [ 'b', 'd' ], value: null },
            { id: '1', key: [ 'b', 'd', 'e' ], value: null },
            { id: '2', key: [ 'b', 'd', 'e' ], value: null },
            { id: '1', key: { a: 1 }, value: null },
            { id: '2', key: { a: 1 }, value: null },
            { id: '1', key: { a: 2 }, value: null },
            { id: '2', key: { a: 2 }, value: null },
            { id: '1', key: { b: 1 }, value: null },
            { id: '2', key: { b: 1 }, value: null },
            { id: '1', key: { b: 2 }, value: null },
            { id: '2', key: { b: 2 }, value: null },
            { id: '1', key: { b: 2, a: 1 }, value: null },
            { id: '2', key: { b: 2, a: 1 }, value: null },
            { id: '1', key: { b: 2, c: 2 }, value: null },
            { id: '2', key: { b: 2, c: 2 }, value: null }
          ]);
        });
      });
    });

    it('Test duplicate collation of objects', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit({ a: 'a' }, { b: 'b' });
            emit({ a: 'a' }, { b: 'b' });
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": { "a": "a" }, "value": { b: 'b' }},
            { "id": "1", "key": { "a": "a" }, "value": { b: 'b' }},
            { "id": "2", "key": { "a": "a" }, "value": { b: 'b' }},
            { "id": "2", "key": { "a": "a" }, "value": { b: 'b' }}
          ]);
        });
      });
    });

    it('Test collation of undefined/null', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit();
            emit(null);
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": null, "value": null},
            { "id": "1", "key": null, "value": null},
            { "id": "2", "key": null, "value": null},
            { "id": "2", "key": null, "value": null}
          ]);
        });
      });
    });

    it('Test collation of null/undefined', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit(null);
            emit();
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": null, "value": null},
            { "id": "1", "key": null, "value": null},
            { "id": "2", "key": null, "value": null},
            { "id": "2", "key": null, "value": null}
          ]);
        });
      });
    });

    it('Test duplicate collation of nulls', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit(null);
            emit(null);
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": null, "value": null},
            { "id": "1", "key": null, "value": null},
            { "id": "2", "key": null, "value": null},
            { "id": "2", "key": null, "value": null}
          ]);
        });
      });
    });

    it('Test duplicate collation of booleans', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit(true);
            emit(true);
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": true, "value": null},
            { "id": "1", "key": true, "value": null},
            { "id": "2", "key": true, "value": null},
            { "id": "2", "key": true, "value": null}
          ]);
        });
      });
    });

    it('Test collation of different objects', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit({ a: 'b' }, { a: 'a' });
            emit({ a: 'a' }, { b: 'b' });
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": { "a": "a" }, "value": { "b": "b" } },
            { "id": "2", "key": { "a": "a" }, "value": { "b": "b" } },
            { "id": "1", "key": { "a": "b" }, "value": { "a": "a" } },
            { "id": "2", "key": { "a": "b" }, "value": { "a": "a" } }
          ]);
        });
      });
    });

    it('Test collation of different objects 2', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit({ a: 'b', b: 'c' }, { a: 'a' });
            emit({ a: 'a' }, { b: 'b' });
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": { "a": "a" }, "value": { "b": "b" } },
            { "id": "2", "key": { "a": "a" }, "value": { "b": "b" } },
            { "id": "1", "key": { "a": "b", "b": "c" }, "value": { "a": "a" } },
            { "id": "2", "key": { "a": "b", "b": "c" }, "value": { "a": "a" } }
          ]);
        });
      });
    });

    it('Test collation of different objects 3', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit({ a: 'a' }, { b: 'b' });
            emit({ a: 'b'}, { a: 'a' });
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": { "a": "a" }, "value": { "b": "b" } },
            { "id": "2", "key": { "a": "a" }, "value": { "b": "b" } },
            { "id": "1", "key": { "a": "b" }, "value": { "a": "a" } },
            { "id": "2", "key": { "a": "b" }, "value": { "a": "a" } }
          ]);
        });
      });
    });

    it('Test collation of different objects 4', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit({ a: 'a'});
            emit({ b: 'b'});
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": { "a": "a" }, "value": null },
            { "id": "2", "key": { "a": "a" }, "value": null },
            { "id": "1", "key": { "b": "b" }, "value": null },
            { "id": "2", "key": { "b": "b" }, "value": null }
          ]);
        });
      });
    });

    it('Test collation of different objects 5', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit({ a: 'a'});
            emit({ a: 'a', b: 'b'});
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": { "a": "a" }, "value": null },
            { "id": "2", "key": { "a": "a" }, "value": null },
            { "id": "1", "key": { "a": "a", "b": "b" }, "value": null },
            { "id": "2", "key": { "a": "a", "b": "b" }, "value": null }
          ]);
        });
      });
    });

    it('Test collation of different objects 6', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit({ a: 'a'});
            emit({ a: 'a', b: 'b'});
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": { "a": "a" }, "value": null },
            { "id": "2", "key": { "a": "a" }, "value": null },
            { "id": "1", "key": { "a": "a", "b": "b" }, "value": null },
            { "id": "2", "key": { "a": "a", "b": "b" }, "value": null }
          ]);
        });
      });
    });

    it('Test collation of different booleans', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit(true);
            emit(false);
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": false, "value": null },
            { "id": "2", "key": false, "value": null },
            { "id": "1", "key": true, "value": null },
            { "id": "2", "key": true, "value": null }
          ]);
        });
      });
    });

    it('Test collation of different booleans 2', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        { _id: '1' },
        { _id: '2' }
      ]).then(function () {
        return createView(db, {
          map: function () {
            emit(false);
            emit(true);
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          var rows = res.rows.map(function (x) {
            return {
              id: x.id,
              key: x.key,
              value: x.value
            };
          });
          assert.deepEqual(rows, [
            { "id": "1", "key": false, "value": null },
            { "id": "2", "key": false, "value": null },
            { "id": "1", "key": true, "value": null },
            { "id": "2", "key": true, "value": null }
          ]);
        });
      });
    });

    it("Test joins", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          if (doc.doc_id) {
            emit(doc._id, {_id: doc.doc_id});
          }
        }
      }).then(function (queryFun) {
        return db.bulkDocs({docs: [
          {_id: 'mydoc', foo: 'bar'},
          { doc_id: 'mydoc' }
        ]}).then(function () {
          return db.query(queryFun, {include_docs: true, reduce: false});
        }).then(function (res) {
          should.exist(res.rows[0].doc);
          return res.rows[0].doc._id;
        });
      }).should.become('mydoc', 'mydoc included');
    });

    it("No reduce function", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function () {
          emit('key', 'val');
        }
      }).then(function (queryFun) {
        return db.post({foo: 'bar'}).then(function () {
          return db.query(queryFun);
        });
      }).should.be.fulfilled;
    });

    it("Query after db.close", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo, 'val');
        }
      }).then(function (queryFun) {
        return db.put({_id: 'doc', foo: 'bar'}).then(function () {
          return db.query(queryFun);
        }).then(function (res) {
          res.rows.should.deep.equal([
            {
              id: 'doc',
              key: 'bar',
              value: 'val'
            }
          ]);
          return db.close();
        }).then(function () {
          db = new PouchDB(dbName);
          return db.query(queryFun).then(function (res) {
            res.rows.should.deep.equal([
              {
                id: 'doc',
                key: 'bar',
                value: 'val'
              }
            ]);
          });
        });
      });
    });

    it("Built in _sum reduce function", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.val, 1);
        },
        reduce: "_sum"
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { val: 'bar' },
            { val: 'bar' },
            { val: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, {reduce: true, group_level: 999});
        }).then(function (resp) {
          return resp.rows.map(function (row) {
            return row.value;
          });
        });
      }).should.become([2, 1]);
    });

    it("Built in _count reduce function", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.val, doc.val);
        },
        reduce: "_count"
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { val: 'bar' },
            { val: 'bar' },
            { val: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, {reduce: true, group_level: 999});
        }).then(function (resp) {
          return resp.rows.map(function (row) {
            return row.value;
          });
        });
      }).should.become([2, 1]);
    });

    it("Built in _stats reduce function", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: "function(doc){emit(doc.val, 1);}",
        reduce: "_stats"
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { val: 'bar' },
            { val: 'bar' },
            { val: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, {reduce: true, group_level: 999});
        }).then(function (res) {
          return res.rows[0].value;
        });
      }).should.become({
        sum: 2,
        count: 2,
        min: 1,
        max: 1,
        sumsqr: 2
      });
    });

    it("Built in _stats reduce function should throw an error with a promise",
      function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: "function(doc){emit(doc.val, 'lala');}",
        reduce: "_stats"
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { val: 'bar' },
              { val: 'bar' },
            { val: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, {reduce: true, group_level: 999});
        });
      }).should.be.rejected;
    });

    it("Built in _sum reduce function should throw an error with a promise",
      function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: "function(doc){emit(null, doc.val);}",
        reduce: "_sum"
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { val: 1 },
            { val: 2 },
            { val: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, {reduce: true, group: true});
        });
      }).should.be.rejected;
    });

    it("Built in _sum reduce function with num arrays should throw an error",
      function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: "function(doc){emit(null, doc.val);}",
        reduce: "_sum"
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { val: [1, 2, 3] },
            { val: 2 },
            { val: ['baz']}
          ]
        }).then(function () {
          return db.query(queryFun, {reduce: true, group: true});
        });
      }).should.be.rejected;
    });

    it("Built in _sum can be used with lists of numbers", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: "function(doc){emit(null, doc.val);}",
        reduce: "_sum"
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { _id: '1', val: 2 },
            { _id: '2', val: [1, 2, 3, 4] },
            { _id: '3', val: [3, 4] },
            { _id: '4', val: 1 }
          ]
        }).then(function () {
          return db.query(queryFun, {reduce: true, group: true});
        }).then(function (res) {
          res.should.deep.equal({rows : [{
            key : null,
            value : [7, 6, 3, 4]
          }]});
        });
      });
    });

    it("#6364 Recognize built in reduce functions with trailing garbage", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.val, 1);
        },
        reduce: "_sum\n \r\nandothergarbage"
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { val: 'bar' },
            { val: 'bar' },
            { val: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, {reduce: true, group_level: 999});
        }).then(function (resp) {
          return resp.rows.map(function (row) {
            return row.value;
          });
        });
      }).should.become([2, 1]);
    });

    it("Starts with _ but not a built in reduce function should throw",
      function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: "function(doc){emit(null, doc.val);}",
        reduce: "_product"
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { val: 1 },
            { val: 2 },
            { val: 3 }
          ]
        }).then(function () {
          return db.query(queryFun, {reduce: true, group: true});
        });
      }).should.be.rejected;
    });

    if (viewType === 'temp' && dbType !== 'http') {
      it("No reduce function, passing just a function", function () {
        var db = new PouchDB(dbName);
        return db.post({foo: 'bar'}).then(function () {
          var queryFun = function () {
            emit('key', 'val');
          };
          return db.query(queryFun);
        }).should.be.fulfilled;
      });
    }

    it('Query result should include _conflicts', function () {
      var db2name = testUtils.adapterUrl(dbType, 'test2b');
      var cleanup = function () {
        return new PouchDB(db2name).destroy();
      };
      var doc1 = {_id: '1', foo: 'bar'};
      var doc2 = {_id: '1', foo: 'baz'};
      var db = new PouchDB(dbName);
      return testUtils.fin(db.info().then(function () {
        return db.put({
          _id: '_design/test',
          views: {
            test: {
              map: function (doc) {
                if (doc._conflicts) {
                  emit(doc._conflicts, null);
                }
              }.toString()
            }
          }
        });
      }).then(function () {
        var remote = new PouchDB(db2name);
        return remote.info().then(function () {
          var replicate = testUtils.promisify(db.replicate.from, db.replicate);
          return db.post(doc1).then(function () {
            return remote.post(doc2);
          }).then(function () {
            return replicate(remote);
          }).then(function () {
            return db.query('test', {include_docs : true, conflicts: true});
          }).then(function (res) {
            should.exist(res.rows[0].doc._conflicts);
            return db.get(res.rows[0].doc._id, {conflicts: true});
          }).then(function (res) {
            should.exist(res._conflicts);
          });
        });
      }), cleanup);
    });

    var icons = [
      "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"
    ];

    var iconDigests = [
      "md5-Mf8m9ehZnCXC717bPkqkCA==",
      "md5-fdEZBYtnvr+nozYVDzzxpA==",
      "md5-ImDARszfC+GA3Cv9TVW4HA==",
      "md5-hBsgoz3ujHM4ioa72btwow==",
      "md5-jDUyV6ySnTVANn2qq3332g=="
    ];

    var iconLengths = [1047, 789, 967, 527, 1108];

    it('#190 Query works with attachments=true', function () {

      var db = new PouchDB(dbName);
      var docs = [];
      for (var i = 0; i < 5; i++) {
        docs.push({
          _id: i.toString(),
          _attachments: {
            'foo.png': {
              data: icons[i],
              content_type: 'image/png'
            }
          }
        });
      }
      return db.bulkDocs(docs).then(function () {
        return createView(db, {
          map: function (doc) {
            emit(doc._id);
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun, {
          include_docs: true,
          attachments: true
        }).then(function (res) {
          var attachments = res.rows.map(function (row) {
            var doc = row.doc;
            delete doc._attachments['foo.png'].revpos;
            return doc._attachments;
          });
          attachments.should.deep.equal(icons.map(function (icon, i) {
            return {
              "foo.png": {
                "content_type": "image/png",
                "data": icon,
                "digest": iconDigests[i]
              }
            };
          }), 'works with attachments=true');
          return db.query(queryFun, {include_docs: true});
        }).then(function (res) {
          var attachments = res.rows.map(function (row) {
            var doc = row.doc;
            delete doc._attachments['foo.png'].revpos;
            return doc._attachments['foo.png'];
          });
          attachments.should.deep.equal(icons.map(function (icon, i) {
            return {
              "content_type": "image/png",
              stub: true,
              "digest": iconDigests[i],
              length: iconLengths[i]
            };
          }), 'works with attachments=false');

          return db.query(queryFun, {attachments: true});
        }).then(function (res) {
          res.rows.should.have.length(5);
          res.rows.forEach(function (row) {
            should.not.exist(row.doc, 'ignored if include_docs=false');
          });
        });
      });
    });

    it('#2858 Query works with attachments=true, binary=true 1', function () {

      // Need to avoid the cache to workaround
      // https://issues.apache.org/jira/browse/COUCHDB-2880
      var db = new PouchDB(dbName, {
        fetch: function (url, opts) {
          opts.cache = 'no-store';
          return PouchDB.fetch(url, opts);
        }
      });
      var docs = [];
      for (var i = 0; i < 5; i++) {
        docs.push({
          _id: i.toString(),
          _attachments: {
            'foo.png': {
              data: icons[i],
              content_type: 'image/png'
            }
          }
        });
      }
      return db.bulkDocs(docs).then(function () {
        return createView(db, {
          map: function (doc) {
            emit(doc._id);
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun, {
          include_docs: true,
          attachments: true,
          binary: true
        }).then(function (res) {
          res.rows.forEach(function (row) {
            var doc = row.doc;
            Object.keys(doc._attachments).forEach(function (attName) {
              var att = doc._attachments[attName];
              should.not.exist(att.stub);
              att.data.should.not.be.a('string');
            });
          });
        });
      });
    });

    it('#2858 Query works with attachments=true, binary=true 2', function () {

      // Need to avoid the cache to workaround
      // https://issues.apache.org/jira/browse/COUCHDB-2880
      var db = new PouchDB(dbName, {
        fetch: function (url, opts) {
          opts.cache = 'no-store';
          return PouchDB.fetch(url, opts);
        }
      });
      var docs = [];
      for (var i = 0; i < 5; i++) {
        docs.push({
          _id: i.toString()
        });
      }
      return db.bulkDocs(docs).then(function () {
        return createView(db, {
          map: function (doc) {
            emit(doc._id);
          }
        });
      }).then(function (queryFun) {
        return db.query(queryFun, {
          include_docs: true,
          attachments: true,
          binary: true
        }).then(function (res) {
          res.rows.forEach(function (row) {
            var doc = row.doc;
            should.not.exist(doc._attachments);
          });
        });
      });
    });

    it('#242 conflicts at the root level', function () {
      var db = new PouchDB(dbName);

      return db.bulkDocs([
        {
          foo: '1',
          _id: 'foo',
          _rev: '1-w',
          _revisions: {start: 1, ids: ['w']}
        }
      ], {new_edits: false}).then(function () {
        return createView(db, {
          map: function (doc) {
            emit(doc.foo);
          }
        }).then(function (queryFun) {
          return db.query(queryFun).then(function (res) {
            res.rows[0].key.should.equal('1');
            return db.bulkDocs([
              {
                foo: '2',
                _id: 'foo',
                _rev: '1-x',
                _revisions: {start: 1, ids: ['x']}
              }
            ], {new_edits: false}).then(function () {
              return db.query(queryFun);
            }).then(function (res) {
              res.rows[0].key.should.equal('2');
              return db.bulkDocs([
                {
                  foo: '3',
                  _id: 'foo',
                  _rev: '1-y',
                  _deleted: true,
                  _revisions: {start: 1, ids: ['y']}
                }
              ], {new_edits: false});
            }).then(function () {
              return db.query(queryFun);
            }).then(function (res) {
              res.rows[0].key.should.equal('2');
            });
          });
        });
      });
    });

    it('#242 conflicts at the root+1 level', function () {
      var db = new PouchDB(dbName);

      return db.bulkDocs([
        {
          foo: '2',
          _id: 'foo',
          _rev: '1-x',
          _revisions: {start: 1, ids: ['x']}
        },
        {
          foo: '3',
          _id: 'foo',
          _rev: '2-y',
          _deleted: true,
          _revisions: {start: 2, ids: ['y', 'x']}
        }

      ], {new_edits: false}).then(function () {
        return createView(db, {
          map: function (doc) {
            emit(doc.foo);
          }
        }).then(function (queryFun) {
          return db.query(queryFun).then(function (res) {
            res.rows.length.should.equal(0);
            return db.bulkDocs([
              {
                foo: '1',
                _id: 'foo',
                _rev: '1-w',
                _revisions: {start: 1, ids: ['w']}
              }
            ], {new_edits: false}).then(function () {
              return db.query(queryFun);
            }).then(function (res) {
              res.rows[0].key.should.equal('1');
              return db.bulkDocs([
                {
                  foo: '4',
                  _id: 'foo',
                  _rev: '1-z',
                  _revisions: {start: 1, ids: ['z']}
                }
              ], {new_edits: false});
            }).then(function () {
              return db.query(queryFun);
            }).then(function (res) {
              res.rows[0].key.should.equal('4');
            });
          });
        });
      });
    });

    it('Views should include _conflicts', function () {
      var db2name = testUtils.adapterUrl(dbType, 'test2');
      var cleanup = function () {
        return new PouchDB(db2name).destroy();
      };
      var doc1 = {_id: '1', foo: 'bar'};
      var doc2 = {_id: '1', foo: 'baz'};
      var db = new PouchDB(dbName);
      return testUtils.fin(db.info().then(function () {
        var remote = new PouchDB(db2name);
        return remote.info().then(function () {
          return createView(db, {
            map : function (doc) {
              emit(doc._id, !!doc._conflicts);
            }
          }).then(function (queryFun) {
            var replicate = testUtils.promisify(db.replicate.from, db.replicate);
            return db.post(doc1).then(function () {
              return remote.post(doc2);
            }).then(function () {
              return replicate(remote);
            }).then(function () {
              return db.get(doc1._id, {conflicts: true});
            }).then(function (res) {
              should.exist(res._conflicts);
              return db.query(queryFun);
            }).then(function (res) {
              res.rows[0].value.should.equal(true);
            });
          });
        });
      }), cleanup);
    });

    it("Test view querying with limit option", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          if (doc.foo === 'bar') {
            emit(doc.foo);
          }
        }
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { foo: 'bar' },
            { foo: 'bar' },
            { foo: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, { limit: 1 });
        }).then(function (res) {
          res.total_rows.should.equal(2, 'Correctly returns total rows');
          res.rows.should.have.length(1, 'Correctly limits returned rows');
        });
      });
    });

    it("Test view querying with custom reduce function", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo);
        },
        reduce: function (keys, values) {
          if (keys) {
            return keys.map(function (keyId) {
              var key = keyId[0];
              // var id = keyId[1];
              return key.join('');
            });
          } else {
            var result = [];
            values.map(function (value) {
              value.map(function (v) {
                result.push(v);
              });
            });
            return result;
          }
        }
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { foo: ['foo', 'bar'] },
            { foo: ['foo', 'bar'] },
            { foo: ['foo', 'bar', 'baz'] },
            { foo: ['baz'] },
            { foo: ['baz', 'bar'] }
          ]
        }).then(function () {
          return db.query(queryFun, { reduce: true });
        }).then(function (res) {
          // We're using `chai.assert` here because the usual `chai.should()`
          // object extension magic won't work when executing functions in a
          // sandbox using node's `vm` module.
          // c.f. https://stackoverflow.com/a/16273649/680742
          assert.lengthOf(res.rows, 1, 'Correctly reduced returned rows');
          assert.isNull(res.rows[0].key, 'Correct, non-existing key');
          assert.lengthOf(res.rows[0].value, 5);
          assert.include(res.rows[0].value, 'foobarbaz');
          assert.include(res.rows[0].value, 'foobar'); // twice
          assert.include(res.rows[0].value, 'bazbar');
          assert.include(res.rows[0].value, 'baz');
          return db.query(queryFun, { group_level: 1, reduce: true });
        }).then(function (res) {
          // We're using `chai.assert` here because the usual `chai.should()`
          // object extension magic won't work when executing functions in a
          // sandbox using node's `vm` module.
          // c.f. https://stackoverflow.com/a/16273649/680742
          assert.lengthOf(res.rows, 2, 'Correctly group reduced rows');
          assert.deepEqual(res.rows[0].key, ['baz']);
          assert.lengthOf(res.rows[0].value, 2);
          assert.include(res.rows[0].value, 'bazbar');
          assert.include(res.rows[0].value, 'baz');
          assert.deepEqual(res.rows[1].key, ['foo']);
          assert.lengthOf(res.rows[1].value, 3);
          assert.include(res.rows[1].value, 'foobarbaz');
          assert.include(res.rows[1].value, 'foobar'); // twice
        });
      });
    });

    it("Test view querying with group_level option and reduce", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo);
        },
        reduce: '_count'
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { foo: ['foo', 'bar'] },
            { foo: ['foo', 'bar'] },
            { foo: ['foo', 'bar', 'baz'] },
            { foo: ['baz'] },
            { foo: ['baz', 'bar'] }
          ]
        }).then(function () {
          return db.query(queryFun, { group_level: 1, reduce: true});
        }).then(function (res) {
          res.rows.should.have.length(2, 'Correctly group returned rows');
          res.rows[0].key.should.deep.equal(['baz']);
          res.rows[0].value.should.equal(2);
          res.rows[1].key.should.deep.equal(['foo']);
          res.rows[1].value.should.equal(3);
          return db.query(queryFun, { group_level: 999, reduce: true});
        }).then(function (res) {
          res.rows.should.have.length(4, 'Correctly group returned rows');
          res.rows[2].key.should.deep.equal(['foo', 'bar']);
          res.rows[2].value.should.equal(2);
          return db.query(queryFun, { group_level: '999', reduce: true});
        }).then(function (res) {
          res.rows.should.have.length(4, 'Correctly group returned rows');
          res.rows[2].key.should.deep.equal(['foo', 'bar']);
          res.rows[2].value.should.equal(2);
          return db.query(queryFun, { group_level: 0, reduce: true});
        }).then(function (res) {
          res.rows.should.have.length(1, 'Correctly group returned rows');
          res.rows[0].value.should.equal(5);
        });
      });
    });

    it("Test view querying with invalid group_level options", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo);
        },
        reduce: '_count'
      }).then(function (queryFun) {
        return db.query(queryFun, {group_level: -1, reduce: true}).then(function (res) {
          res.should.not.exist('expected error on invalid group_level');
        }).catch(function (err) {
          err.status.should.be.oneOf([400, 500]);
          err.message.should.be.a('string');
          return db.query(queryFun, { group_level: 'exact', reduce: true});
        }).then(function (res) {
          res.should.not.exist('expected error on invalid group_level');
        }).catch(function (err) {
          err.status.should.be.oneOf([400, 500]);
          err.message.should.be.a('string');
        });
      });
    });

    it("Test view querying with limit option and reduce", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo);
        },
        reduce: '_count'
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { foo: 'bar' },
            { foo: 'bar' },
            { foo: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, { limit: 1, group: true, reduce: true});
        }).then(function (res) {
          res.rows.should.have.length(1, 'Correctly limits returned rows');
          res.rows[0].key.should.equal('bar');
          res.rows[0].value.should.equal(2);
        }).then(function () {
          return db.query(queryFun, { limit: '1', group: true, reduce: true});
        }).then(function (res) {
          res.rows.should.have.length(1, 'Correctly limits returned rows');
          res.rows[0].key.should.equal('bar');
          res.rows[0].value.should.equal(2);
        });
      });
    });

    it("Test view querying with invalid limit option and reduce", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo);
        },
        reduce: '_count'
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { foo: 'bar' },
            { foo: 'bar' },
            { foo: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, { limit: -1, group: true, reduce: true});
        }).then(function (res) {
          res.should.not.exist('expected error on invalid group_level');
        }).catch(function (err) {
          err.status.should.be.oneOf([400, 500]);
          err.message.should.be.a('string');
          return db.query(queryFun, { limit: '1a', group: true, reduce: true});
        }).then(function (res) {
          res.should.not.exist('expected error on invalid group_level');
        }).catch(function (err) {
          err.status.should.be.oneOf([400, 500]);
          err.message.should.be.a('string');
        });
      });
    });

    it('Test unsafe object usage (#244)', function () {
      var db = new PouchDB(dbName);
      return db.bulkDocs([
        {_id: 'constructor'}
      ]).then(function (res) {
        var rev = res[0].rev;
        return createView(db, {
          map: function (doc) {
            emit(doc._id);
          }
        }).then(function (queryFun) {
          return db.query(queryFun, {include_docs: true}).then(function (res) {
            res.rows.should.deep.equal([
              {
                "key": "constructor",
                "id": "constructor",
                "value": null,
                "doc": {
                  "_id": "constructor",
                  "_rev": rev
                }
              }
            ]);
            return db.bulkDocs([
              {_id: 'constructor', _rev: rev}
            ]);
          }).then(function (res) {
            rev = res[0].rev;
            return db.query(queryFun, {include_docs: true});
          }).then(function (res) {
            res.rows.should.deep.equal([
              {
                "key": "constructor",
                "id": "constructor",
                "value": null,
                "doc": {
                  "_id": "constructor",
                  "_rev": rev
                }
              }
            ]);
            return db.bulkDocs([
              {_id: 'constructor', _rev: rev, _deleted: true}
            ]);
          }).then(function (res) {
            rev = res[0].rev;
            return db.query(queryFun, {include_docs: true});
          }).then(function (res) {
            res.rows.should.deep.equal([]);
          });
        });
      });
    });

    it("Test view querying with a skip option and reduce", function () {
      var qf;
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo);
        },
        reduce: '_count'
      }).then(function (queryFun) {
        qf = queryFun;
        return db.bulkDocs({
          docs: [
            { foo: 'bar' },
            { foo: 'bar' },
            { foo: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, {skip: 1, group: true, reduce: true});
        });
      }).then(function (res) {
        res.rows.should.have.length(1, 'Correctly limits returned rows');
        res.rows[0].key.should.equal('baz');
        res.rows[0].value.should.equal(1);
      }).then(function () {
        return db.query(qf, {skip: '1', group: true, reduce: true});
      }).then(function (res) {
        res.rows.should.have.length(1, 'Correctly limits returned rows');
        res.rows[0].key.should.equal('baz');
        res.rows[0].value.should.equal(1);
      });
    });

    it("Test view querying with invalid skip option and reduce", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo);
        },
        reduce: '_count'
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { foo: 'bar' },
            { foo: 'bar' },
            { foo: 'baz' }
          ]
        }).then(function () {
          return db.query(queryFun, { skip: -1, group: true, reduce: true});
        }).then(function (res) {
          res.should.not.exist('expected error on invalid group_level');
        }).catch(function (err) {
          err.status.should.be.oneOf([400, 500]);
          err.message.should.be.a('string');
          return db.query(queryFun, { skip: '1a', group: true, reduce: true});
        }).then(function (res) {
          res.should.not.exist('expected error on invalid group_level');
        }).catch(function (err) {
          err.status.should.be.oneOf([400, 500]);
          err.message.should.be.a('string');
        });
      });
    });

    it("Special document member _doc_id_rev should never leak outside",
      function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          if (doc.foo === 'bar') {
            emit(doc.foo);
          }
        }
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { foo: 'bar' }
          ]
        }).then(function () {
          return db.query(queryFun, { include_docs: true });
        }).then(function (res) {
          should.not.exist(res.rows[0].doc._doc_id_rev, '_doc_id_rev is leaking but should not');
        });
      });
    });

    it('multiple view creations and cleanups', function () {
      var db = new PouchDB(dbName);
      var map = function (doc) { emit(doc.num); };
      function createView(name) {
        var storableViewObj = { map: map.toString() };
        return  db.put({
          _id: '_design/' + name,
          views: {
            theView: storableViewObj
          }
        });
      }
      return db.bulkDocs({
        docs: [
          {_id: 'test1'}
        ]
      }).then(function () {
        function sequence(name) {
          return createView(name).then(function () {
            return db.query(name + '/theView').then(function () {
              return db.viewCleanup();
            });
          });
        }
        var attempts = [];
        var numAttempts = 10;
        for (var i = 0; i < numAttempts; i++) {
          attempts.push(sequence('test' + i));
        }
        return Promise.all(attempts).then(function () {
          var keys = [];
          for (var i = 0; i < numAttempts; i++) {
            keys.push('_design/test' + i);
          }
          return db.allDocs({keys, include_docs : true});
        }).then(function (res) {
          var docs = res.rows.map(function (row) {
            row.doc._deleted = true;
            return row.doc;
          });
          return db.bulkDocs({docs});
        }).then(function () {
          return db.viewCleanup();
        }).then(function (res) {
          if (res.error) {
            res.error.should.equal('not_found');
          } else {
            res.ok.should.equal(true);
          }
        });
      });
    });

    it('If reduce function returns 0, resulting value should not be null', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo);
        },
        reduce: function () {
          return 0;
        }
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { foo: 'bar' }
          ]
        }).then(function () {
          return db.query(queryFun).then(function (data) {
            should.exist(data.rows[0].value);
          });
        });
      });
    });

    it('Testing skip with a view', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          emit(doc.foo);
        }
      }).then(function (queryFun) {
        return db.bulkDocs({
          docs: [
            { foo: 'bar' },
            { foo: 'baz' },
            { foo: 'baf' }
          ]
        }).then(function () {
          return db.query(queryFun, {skip: 1});
        }).then(function (data) {
          data.rows.should.have.length(2);
          data.offset.should.equal(1);
          data.total_rows.should.equal(3);
        });
      });
    });

    it('Map documents on 0/null/undefined/empty string', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          emit(doc.num);
        }
      }).then(function (mapFunction) {
        var docs = [
          {_id: '0', num: 0},
          {_id: '1', num: 1},
          {_id: 'undef' /* num is undefined */},
          {_id: 'null', num: null},
          {_id: 'empty', num: ''},
          {_id: 'nan', num: NaN},
          {_id: 'inf', num: Infinity},
          {_id: 'neginf', num: -Infinity}
        ];
        return db.bulkDocs({docs}).then(function () {
          return db.query(mapFunction, {key: 0});
        }).then(function (data) {
          data.rows.should.have.length(1);
          data.rows[0].id.should.equal('0');

          return db.query(mapFunction, {key: ''});
        }).then(function (data) {
          data.rows.should.have.length(1);
          data.rows[0].id.should.equal('empty');

          return db.query(mapFunction, {key: undefined});
        }).then(function (data) {
          data.rows.should.have.length(8); // everything

          // keys that should all resolve to null
          var emptyKeys = [null, NaN, Infinity, -Infinity];
          return Promise.all(emptyKeys.map(function (emptyKey) {
            return db.query(mapFunction, {key: emptyKey}).then(function (data) {
              data.rows.map(function (row) {
                return row.id;
              }).should.deep.equal(['inf', 'nan', 'neginf', 'null', 'undef']);
            });
          }));
        });
      });
    });

    it('Testing query with keys', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.field);
        }
      }).then(function (queryFun) {
        var opts = {include_docs: true};
        return db.bulkDocs({
          docs: [
            {_id: 'doc_0', field: 0},
            {_id: 'doc_1', field: 1},
            {_id: 'doc_2', field: 2},
            {_id: 'doc_empty', field: ''},
            {_id: 'doc_null', field: null},
            {_id: 'doc_undefined' /* field undefined */},
            {_id: 'doc_foo', field: 'foo'}
          ]
        }).then(function () {
          return db.query(queryFun, opts);
        }).then(function (data) {
          data.rows.should.have.length(7, 'returns all docs');
          opts.keys = [];
          return db.query(queryFun, opts);
        }).then(function (data) {
          data.rows.should.have.length(0, 'returns 0 docs');
          opts.keys = [0];
          // When passed an empty keys array (above), query mutates opts by deleting the
          // keys array and adding limit = 0. That behavior breaks this test result when
          // implementing limit and skip (#8370); it is correct (and necessary) to clean
          // up that side effect here.
          delete opts.limit;
          return db.query(queryFun, opts);
        }).then(function (data) {
          data.rows.should.have.length(1, 'returns one doc');
          data.rows[0].doc._id.should.equal('doc_0');

          opts.keys = [2, 'foo', 1, 0, null, ''];
          return db.query(queryFun, opts);
        }).then(function (data) {
          // check that the returned ordering fits opts.keys
          data.rows.should.have.length(7, 'returns 7 docs in correct order');
          data.rows[0].doc._id.should.equal('doc_2');
          data.rows[1].doc._id.should.equal('doc_foo');
          data.rows[2].doc._id.should.equal('doc_1');
          data.rows[3].doc._id.should.equal('doc_0');
          data.rows[4].doc._id.should.equal('doc_null');
          data.rows[5].doc._id.should.equal('doc_undefined');
          data.rows[6].doc._id.should.equal('doc_empty');

          opts.keys = [3, 1, 4, 2];
          return db.query(queryFun, opts);
        }).then(function (data) {
          // nonexistent keys just give us holes in the list
          data.rows.should.have.length(2, 'returns 2 non-empty docs');
          data.rows[0].key.should.equal(1);
          data.rows[0].doc._id.should.equal('doc_1');
          data.rows[1].key.should.equal(2);
          data.rows[1].doc._id.should.equal('doc_2');

          opts.keys = [2, 1, 2, 0, 2, 1];
          return db.query(queryFun, opts);
        }).then(function (data) {
          // with duplicates, we return multiple docs
          data.rows.should.have.length(6, 'returns 6 docs with duplicates');
          data.rows[0].doc._id.should.equal('doc_2');
          data.rows[1].doc._id.should.equal('doc_1');
          data.rows[2].doc._id.should.equal('doc_2');
          data.rows[3].doc._id.should.equal('doc_0');
          data.rows[4].doc._id.should.equal('doc_2');
          data.rows[5].doc._id.should.equal('doc_1');

          opts.keys = [2, 1, 2, 3, 2];
          return db.query(queryFun, opts);
        }).then(function (data) {
          // duplicates and unknowns at the same time, for maximum weirdness
          data.rows.should.have.length(4, 'returns 2 docs with duplicates/unknowns');
          data.rows[0].doc._id.should.equal('doc_2');
          data.rows[1].doc._id.should.equal('doc_1');
          data.rows[2].doc._id.should.equal('doc_2');
          data.rows[3].doc._id.should.equal('doc_2');

          opts.keys = [3];
          return db.query(queryFun, opts);
        }).then(function (data) {
          data.rows.should.have.length(0, 'returns 0 doc due to unknown key');

          opts.include_docs = false;
          opts.keys = [3, 2];
          return db.query(queryFun, opts);
        }).then(function (data) {
          data.rows.should.have.length(1, 'returns 1 doc due to unknown key');
          data.rows[0].id.should.equal('doc_2');
          should.not.exist(data.rows[0].doc, 'no doc, since include_docs=false');
        });
      });
    });

    it('Testing query with multiple keys, multiple docs', function () {
      function ids(row) {
        return row.id;
      }
      var opts = {keys: [0, 1, 2]};
      var spec;
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.field1);
          emit(doc.field2);
        }
      }).then(function (mapFunction) {
        return db.bulkDocs({
          docs: [
            {_id: '0', field1: 0},
            {_id: '1a', field1: 1},
            {_id: '1b', field1: 1},
            {_id: '1c', field1: 1},
            {_id: '2+3', field1: 2, field2: 3},
            {_id: '4+5', field1: 4, field2: 5},
            {_id: '3+5', field1: 3, field2: 5},
            {_id: '3+4', field1: 3, field2: 4}
          ]
        }).then(function () {
          spec = ['0', '1a', '1b', '1c', '2+3'];
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(spec);

          opts.keys = [3, 5, 4, 3];
          spec = ['2+3', '3+4', '3+5', '3+5', '4+5', '3+4', '4+5', '2+3', '3+4', '3+5'];
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(spec);
        });
      });
    });

    it('Testing multiple emissions (issue #14)', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          emit(doc.foo);
          emit(doc.bar);
          emit(doc.foo);
          emit(doc.bar, 'multiple values!');
          emit(doc.bar, 'crayon!');
        }
      }).then(function (mapFunction) {
        return db.bulkDocs({
          docs: [
            {_id: 'doc1', foo : 'foo', bar : 'bar'},
            {_id: 'doc2', foo : 'foo', bar : 'bar'}
          ]
        }).then(function () {
          var opts = {keys: ['foo', 'bar']};

          return db.query(mapFunction, opts);
        });
      }).then(function (data) {
        data.rows.should.have.length(10);

        data.rows[0].key.should.equal('foo');
        data.rows[0].id.should.equal('doc1');
        data.rows[1].key.should.equal('foo');
        data.rows[1].id.should.equal('doc1');

        data.rows[2].key.should.equal('foo');
        data.rows[2].id.should.equal('doc2');
        data.rows[3].key.should.equal('foo');
        data.rows[3].id.should.equal('doc2');

        data.rows[4].key.should.equal('bar');
        data.rows[4].id.should.equal('doc1');
        should.not.exist(data.rows[4].value);
        data.rows[5].key.should.equal('bar');
        data.rows[5].id.should.equal('doc1');
        data.rows[5].value.should.equal('crayon!');
        data.rows[6].key.should.equal('bar');
        data.rows[6].id.should.equal('doc1');
        data.rows[6].value.should.equal('multiple values!');

        data.rows[7].key.should.equal('bar');
        data.rows[7].id.should.equal('doc2');
        should.not.exist(data.rows[7].value);
        data.rows[8].key.should.equal('bar');
        data.rows[8].id.should.equal('doc2');
        data.rows[8].value.should.equal('crayon!');
        data.rows[9].key.should.equal('bar');
        data.rows[9].id.should.equal('doc2');
        data.rows[9].value.should.equal('multiple values!');
      });
    });

    it('Testing multiple emissions (complex keys)', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function () {
          emit(['a'], 1);
          emit(['b'], 3);
          emit(['a'], 2);
        }
      }).then(function (mapFunction) {
        return db.bulkDocs({
          docs: [
            {_id: 'doc1', foo: 'foo', bar: 'bar'}
          ]
        }).then(function () {
          return db.query(mapFunction);
        });
      }).then(function (data) {
        data.rows.should.have.length(3);
        data.rows[0].key.should.eql(['a']);
        data.rows[0].value.should.equal(1);
        data.rows[1].key.should.eql(['a']);
        data.rows[1].value.should.equal(2);
        data.rows[2].key.should.eql(['b']);
        data.rows[2].value.should.equal(3);
      });
    });

    it('Testing empty startkeys and endkeys', function () {
      var opts = {startkey: null, endkey: ''};
      function ids(row) {
        return row.id;
      }
      var spec;
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          emit(doc.field);
        }
      }).then(function (mapFunction) {
        return db.bulkDocs({
          docs: [
            {_id: 'doc_empty', field: ''},
            {_id: 'doc_null', field: null},
            {_id: 'doc_undefined' /* field undefined */},
            {_id: 'doc_foo', field: 'foo'}
          ]
        }).then(function () {
          spec = ['doc_null', 'doc_undefined', 'doc_empty'];
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(spec);

          opts = {startkey: '', endkey: 'foo'};
          spec = ['doc_empty', 'doc_foo'];
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(spec);

          opts = {startkey: null, endkey: null};
          spec = ['doc_null', 'doc_undefined'];
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(spec);

          opts.descending = true;
          spec.reverse();
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(spec);
        });
      });
    });

    it('#238 later non-winning revisions', function () {
      var db = new PouchDB(dbName);

      return createView(db, {
        map: function (doc) {
          emit(doc.name);
        }
      }).then(function (mapFun) {
        return db.bulkDocs([{
          _id: 'doc',
          name: 'zoot',
          _rev: '2-x',
          _revisions: {
            start: 2,
            ids: ['x', 'y']
          }
        }], {new_edits: false}).then(function () {
          return db.query(mapFun);
        }).then(function (res) {
          res.rows.should.have.length(1);
          res.rows[0].id.should.equal('doc');
          res.rows[0].key.should.equal('zoot');
          return db.bulkDocs([{
            _id: 'doc',
            name: 'suit',
            _rev: '2-w',
            _revisions: {
              start: 2,
              ids: ['w', 'y']
            }
          }], {new_edits: false});
        }).then(function () {
          return db.query(mapFun);
        }).then(function (res) {
          res.rows.should.have.length(1);
          res.rows[0].id.should.equal('doc');
          res.rows[0].key.should.equal('zoot');
        });
      });
    });

    it('#238 later non-winning deleted revisions', function () {
      var db = new PouchDB(dbName);

      return createView(db, {
        map: function (doc) {
          emit(doc.name);
        }
      }).then(function (mapFun) {
        return db.bulkDocs([{
          _id: 'doc',
          name: 'zoot',
          _rev: '2-x',
          _revisions: {
            start: 2,
            ids: ['x', 'y']
          }
        }], {new_edits: false}).then(function () {
          return db.query(mapFun);
        }).then(function (res) {
          res.rows.should.have.length(1);
          res.rows[0].id.should.equal('doc');
          res.rows[0].key.should.equal('zoot');
          return db.bulkDocs([{
            _id: 'doc',
            name: 'suit',
            _deleted: true,
            _rev: '2-z',
            _revisions: {
              start: 2,
              ids: ['z', 'y']
            }
          }], {new_edits: false});
        }).then(function () {
          return db.query(mapFun);
        }).then(function (res) {
          res.rows.should.have.length(1);
          res.rows[0].id.should.equal('doc');
          res.rows[0].key.should.equal('zoot');
        });
      });
    });

    it('#238 query with conflicts', function () {
      var db = new PouchDB(dbName);

      return createView(db, {
        map: function (doc) {
          emit(doc.name);
        }
      }).then(function (mapFun) {
        return db.bulkDocs([

          {
            _id: 'doc',
            name: 'zab',
            _rev: '2-y',
            _revisions: {
              start: 1,
              ids: ['y']
            }
          }, {
            _id: 'doc',
            name: 'zoot',
            _rev: '2-x',
            _revisions: {
              start: 2,
              ids: ['x', 'y']
            }
          }
        ], {new_edits: false}).then(function () {
          return db.query(mapFun);
        }).then(function (res) {
          res.rows.should.have.length(1);
          res.rows[0].id.should.equal('doc');
          res.rows[0].key.should.equal('zoot');
          return db.bulkDocs([
            {
              _id: 'doc',
              name: 'suit',
              _rev: '2-w',
              _revisions: {
                start: 2,
                ids: ['w', 'y']
              }
            }, {
              _id: 'doc',
              name: 'zorb',
              _rev: '2-z',
              _revisions: {
                start: 2,
                ids: ['z', 'y']
              }
            }
          ], {new_edits: false});
        }).then(function () {
          return db.query(mapFun);
        }).then(function (res) {
          res.rows.should.have.length(1);
          res.rows[0].id.should.equal('doc');
          res.rows[0].key.should.equal('zorb');
        });
      });
    });

    it('Testing ordering with startkey/endkey/key', function () {
      var opts = {startkey: '1', endkey: '4'};
      function ids(row) {
        return row.id;
      }
      var spec;
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          emit(doc.field, null);
        }
      }).then(function (mapFunction) {
        return db.bulkDocs({
          docs: [
            {_id: 'h', field: '4'},
            {_id: 'a', field: '1'},
            {_id: 'e', field: '2'},
            {_id: 'c', field: '1'},
            {_id: 'f', field: '3'},
            {_id: 'g', field: '4'},
            {_id: 'd', field: '2'},
            {_id: 'b', field: '1'}
          ]
        }).then(function () {
          spec = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(spec);

          opts = {key: '1'};
          spec = ['a', 'b', 'c'];
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(spec);

          opts = {key: '2'};
          spec = ['d', 'e'];
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(spec);

          opts.descending = true;
          spec.reverse();
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(spec, 'reverse order');
        });
      });
    });

    it('opts.keys should work with complex keys', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo, doc.foo);
        }
      }).then(function (mapFunction) {
        var keys = [
          {key: 'missing'},
          ['test', 1],
          {key1: 'value1'},
          ['missing'],
          [0, 0]
        ];
        return db.bulkDocs({
          docs: [
            {foo: {key2: 'value2'}},
            {foo: {key1: 'value1'}},
            {foo: [0, 0]},
            {foo: ['test', 1]},
            {foo: [0, false]}
          ]
        }).then(function () {
          var opts = {keys};
          return db.query(mapFunction, opts);
        }).then(function (data) {
          data.rows.should.have.length(3);
          data.rows[0].value.should.deep.equal(keys[1]);
          data.rows[1].value.should.deep.equal(keys[2]);
          data.rows[2].value.should.deep.equal(keys[4]);
        });
      });
    });

    it('Testing ordering with dates', function () {
      function ids(row) {
        return row.id;
      }
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          emit(doc.date, null);
        }
      }).then(function (mapFunction) {
        return db.bulkDocs({
          docs: [
            {_id: '1969', date: '1969 was when Space Oddity hit'},
            {_id: '1971', date : new Date('1971-12-17T00:00:00.000Z')}, // Hunky Dory was released
            {_id: '1972', date: '1972 was when Ziggy landed on Earth'},
            {_id: '1977', date: new Date('1977-01-14T00:00:00.000Z')}, // Low was released
            {_id: '1985', date: '1985+ is better left unmentioned'}
          ]
        }).then(function () {
          return db.query(mapFunction);
        }).then(function (data) {
          data.rows.map(ids).should.deep.equal(['1969', '1971', '1972', '1977', '1985']);
        });
      });
    });

    it('should work with a joined doc', function () {
      function change(row) {
        return [row.key, row.doc._id, row.doc.val];
      }
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          if (doc.join) {
            emit(doc.color, {_id : doc.join});
          }
        }
      }).then(function (mapFunction) {
        return db.bulkDocs({
          docs: [
            {_id: 'a', join: 'b', color: 'green'},
            {_id: 'b', val: 'c'},
            {_id: 'd', join: 'f', color: 'red'}
          ]
        }).then(function () {
          return db.query(mapFunction, {include_docs: true});
        }).then(function (resp) {
          return change(resp.rows[0]).should.deep.equal(['green', 'b', 'c']);
        });
      });
    });

    it('should query correctly with a variety of criteria', function () {
      var db = new PouchDB(dbName);
      var ddoc = {
        _id: '_design/test',
        views: {
          test: {
            map: function (doc) {
              emit(doc._id);
            }.toString()
          }
        }
      };
      var mapFun = 'test';
      return db.put(ddoc).then(function () {
        var docs = [
          {_id : '0'},
          {_id : '1'},
          {_id : '2'},
          {_id : '3'},
          {_id : '4'},
          {_id : '5'},
          {_id : '6'},
          {_id : '7'},
          {_id : '8'},
          {_id : '9'}
        ];
        return db.bulkDocs({docs}).then(function (res) {
          docs[3]._deleted = true;
          docs[7]._deleted = true;
          docs[3]._rev = res[3].rev;
          docs[7]._rev = res[7].rev;
          return db.remove(docs[3]);
        }).then(function () {
          return db.remove(docs[7]);
        }).then(function () {
          return db.query(mapFun, {});
        }).then(function (res) {
          res.rows.should.have.length(8, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {startkey : '5'});
        }).then(function (res) {
          res.rows.should.have.length(4, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {startkey : '5', skip : 2, limit : 10});
        }).then(function (res) {
          res.rows.should.have.length(2, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {startkey : '5', descending : true, skip : 1});
        }).then(function (res) {
          res.rows.should.have.length(4, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {startkey : '5', endkey : 'z'});
        }).then(function (res) {
          res.rows.should.have.length(4, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {startkey : '5', endkey : '5'});
        }).then(function (res) {
          res.rows.should.have.length(1, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {startkey : '5', endkey : '4', descending : true});
        }).then(function (res) {
          res.rows.should.have.length(2, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {startkey : '3', endkey : '7', descending : false});
        }).then(function (res) {
          res.rows.should.have.length(3, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {startkey : '7', endkey : '3', descending : true});
        }).then(function (res) {
          res.rows.should.have.length(3, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {startkey : '', endkey : '0'});
        }).then(function (res) {
          res.rows.should.have.length(1, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {keys : ['0', '1', '3']});
        }).then(function (res) {
          res.rows.should.have.length(2, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {keys : ['0', '1', '0', '2', '1', '1']});
        }).then(function (res) {
          res.rows.should.have.length(6, 'correctly return rows');
          res.rows.map(function (row) { return row.key; }).should.deep.equal(
            ['0', '1', '0', '2', '1', '1']);
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {keys : []});
        }).then(function (res) {
          res.rows.should.have.length(0, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {keys : ['7']});
        }).then(function (res) {
          res.rows.should.have.length(0, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {key : '3'});
        }).then(function (res) {
          res.rows.should.have.length(0, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {key : '2'});
        }).then(function (res) {
          res.rows.should.have.length(1, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');
          return db.query(mapFun, {key : 'z'});
        }).then(function (res) {
          res.rows.should.have.length(0, 'correctly return rows');
          res.total_rows.should.equal(8, 'correctly return total_rows');

          return db.query(mapFun, {startkey : '5', endkey : '4'}).then(function (res) {
            res.should.not.exist('expected error on reversed start/endkey');
          }).catch(function (err) {
            err.status.should.be.oneOf([400, 500]);
            err.message.should.be.a('string');
          });
        });
      });
    });

    it('should query correctly with skip/limit and multiple keys/values', function () {
      var db = new PouchDB(dbName);
      var docs = {
        docs: [
          {_id: 'doc1', foo : 'foo', bar : 'bar'},
          {_id: 'doc2', foo : 'foo', bar : 'bar'}
        ]
      };
      var getValues = function (res) {
        return res.value;
      };
      var getIds = function (res) {
        return res.id;
      };

      return createView(db, {
        map : function (doc) {
          emit(doc.foo, 'fooValue');
          emit(doc.foo);
          emit(doc.bar);
          emit(doc.bar, 'crayon!');
          emit(doc.bar, 'multiple values!');
          emit(doc.bar, 'crayon!');
        }
      }).then(function (mapFun) {

        return db.bulkDocs(docs).then(function () {
          return db.query(mapFun, {});
        }).then(function (res) {
          res.rows.should.have.length(12, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          res.rows.map(getValues).should.deep.equal(
            [null, 'crayon!', 'crayon!', 'multiple values!',
              null, 'crayon!', 'crayon!', 'multiple values!',
              null, 'fooValue', null, 'fooValue']);
          res.rows.map(getIds).should.deep.equal(
            ['doc1', 'doc1', 'doc1', 'doc1',
              'doc2', 'doc2', 'doc2', 'doc2',
              'doc1', 'doc1', 'doc2', 'doc2']);
          return db.query(mapFun, {startkey : 'foo'});
        }).then(function (res) {
          res.rows.should.have.length(4, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          res.rows.map(getValues).should.deep.equal(
            [null, 'fooValue', null, 'fooValue']);
          res.rows.map(getIds).should.deep.equal(
            ['doc1', 'doc1', 'doc2', 'doc2']);
          return db.query(mapFun, {startkey : 'foo', endkey : 'foo'});
        }).then(function (res) {
          res.rows.should.have.length(4, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          return db.query(mapFun, {startkey : 'bar', endkey : 'bar'});
        }).then(function (res) {
          res.rows.should.have.length(8, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          return db.query(mapFun, {startkey : 'foo', limit : 1});
        }).then(function (res) {
          res.rows.should.have.length(1, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          res.rows.map(getValues).should.deep.equal([null]);
          res.rows.map(getIds).should.deep.equal(['doc1']);
          return db.query(mapFun, {startkey : 'foo', limit : 2});
        }).then(function (res) {
          res.rows.should.have.length(2, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          return db.query(mapFun, {startkey : 'foo', limit : 1000});
        }).then(function (res) {
          res.rows.should.have.length(4, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          return db.query(mapFun, {startkey : 'foo', skip : 1});
        }).then(function (res) {
          res.rows.should.have.length(3, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          return db.query(mapFun, {startkey : 'foo', skip : 3, limit : 0});
        }).then(function (res) {
          res.rows.should.have.length(0, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          return db.query(mapFun, {startkey : 'foo', skip : 3, limit : 1});
        }).then(function (res) {
          res.rows.should.have.length(1, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          res.rows.map(getValues).should.deep.equal(['fooValue']);
          res.rows.map(getIds).should.deep.equal(['doc2']);
          return db.query(mapFun, {startkey : 'quux', skip : 3, limit : 1});
        }).then(function (res) {
          res.rows.should.have.length(0, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
          return db.query(mapFun, {startkey : 'bar', limit : 2});
        }).then(function (res) {
          res.rows.should.have.length(2, 'correctly return rows');
          res.total_rows.should.equal(12, 'correctly return total_rows');
        });
      });
    });

    it('should query correctly with undefined key/values', function () {
      var db = new PouchDB(dbName);
      var docs = {
        docs: [
          {_id: 'doc1'},
          {_id: 'doc2'}
        ]
      };
      return createView(db, {
        map : function () {
          emit();
        }
      }).then(function (mapFun) {
        return db.bulkDocs(docs).then(function () {
          return db.query(mapFun, {});
        }).then(function (res) {
          res.total_rows.should.equal(2, 'correctly return total_rows');
          res.rows.should.deep.equal([
            {
              key : null,
              value : null,
              id : 'doc1'
            },
            {
              key : null,
              value : null,
              id : 'doc2'
            }
          ]);
        });
      });
    });

    it('should query correctly with no docs', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function () {
          emit();
        }
      }).then(function (queryFun) {
        return db.query(queryFun).then(function (res) {
          res.total_rows.should.equal(0, 'total_rows');
          res.offset.should.equal(0);
          res.rows.should.deep.equal([]);
        });
      });
    });

    it('should query correctly with no emits', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function () {
        }
      }).then(function (queryFun) {
        return db.bulkDocs({docs : [
          {_id : 'foo'},
          {_id : 'bar'}
        ]}).then(function () {
          return db.query(queryFun).then(function (res) {
            res.total_rows.should.equal(0, 'total_rows');
            res.offset.should.equal(0);
            res.rows.should.deep.equal([]);
          });
        });
      });
    });

    it('should correctly return results when reducing or not reducing', function () {

      function keyValues(row) {
        return { key: row.key, value: row.value };
      }
      function keys(row) {
        return row.key;
      }
      function values(row) {
        return row.value;
      }
      function docIds(row) {
        return row.doc._id;
      }
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          emit(doc.name);
        },
        reduce : '_count'
      }).then(function (queryFun) {
        return db.bulkDocs({docs : [
          {name : 'foo', _id : '1'},
          {name : 'bar', _id : '2'},
          {name : 'foo', _id : '3'},
          {name : 'quux', _id : '4'},
          {name : 'foo', _id : '5'},
          {name : 'foo', _id : '6'},
          {name : 'foo', _id : '7'}

        ]}).then(function () {
          return db.query(queryFun);
        }).then(function (res) {
          Object.keys(res.rows[0]).sort().should.deep.equal(['key', 'value'],
                                                            'object only have 2 keys');
          should.not.exist(res.total_rows, 'no total_rows1');
          should.not.exist(res.offset, 'no offset1');
          res.rows.map(keyValues).should.deep.equal([
            {
              key   : null,
              value : 7
            }
          ]);
          return db.query(queryFun, {group : true});
        }).then(function (res) {
          Object.keys(res.rows[0]).sort().should.deep.equal(['key', 'value'],
                                                            'object only have 2 keys');
          should.not.exist(res.total_rows, 'no total_rows2');
          should.not.exist(res.offset, 'no offset2');
          res.rows.map(keyValues).should.deep.equal([
            {
              key : 'bar',
              value : 1
            },
            {
              key : 'foo',
              value : 5
            },
            {
              key : 'quux',
              value : 1
            }
          ]);
          return db.query(queryFun, {reduce : false});
        }).then(function (res) {
          Object.keys(res.rows[0]).sort().should.deep.equal(['id', 'key', 'value'],
                                                            'object only have 3 keys');
          res.total_rows.should.equal(7, 'total_rows1');
          res.offset.should.equal(0, 'offset1');
          res.rows.map(keys).should.deep.equal([
            'bar', 'foo', 'foo', 'foo', 'foo', 'foo', 'quux'
          ]);
          res.rows.map(values).should.deep.equal([
            null, null, null, null, null, null, null
          ]);
          return db.query(queryFun, {reduce : false, skip : 3});
        }).then(function (res) {
          Object.keys(res.rows[0]).sort().should.deep.equal(['id', 'key', 'value'],
                                                            'object only have 3 keys');
          res.total_rows.should.equal(7, 'total_rows2');
          res.offset.should.equal(3, 'offset2');
          res.rows.map(keys).should.deep.equal([
            'foo', 'foo', 'foo', 'quux'
          ]);
          return db.query(queryFun, {reduce : false, include_docs : true});
        }).then(function (res) {
          Object.keys(res.rows[0]).sort().should.deep.equal(['doc', 'id', 'key', 'value'],
                                                            'object only have 4 keys');
          res.total_rows.should.equal(7, 'total_rows3');
          res.offset.should.equal(0, 'offset3');
          res.rows.map(keys).should.deep.equal([
            'bar', 'foo', 'foo', 'foo', 'foo', 'foo', 'quux'
          ]);
          res.rows.map(values).should.deep.equal([
            null, null, null, null, null, null, null
          ]);
          res.rows.map(docIds).should.deep.equal([
            '2', '1', '3', '5', '6', '7', '4'
          ]);
          return db.query(queryFun, {include_docs : true}).then(function (res) {
            should.not.exist(res);
          }).catch(function (err) {
            err.status.should.be.oneOf([400, 500]);
            err.message.should.be.a('string');
            // include_docs is invalid for reduce
          });
        });
      });
    });

    it('should query correctly after replicating and other ddoc', function () {
      var db = new PouchDB(dbName);
      var db2 = new PouchDB(testUtils.adapterUrl(dbType, 'local-other'));
      return createView(db, {
        map: function (doc) {
          emit(doc.name);
        }
      }).then(function (queryFun) {
        return db.bulkDocs({docs: [{name: 'foobar'}]}).then(function () {
          return db.query(queryFun);
        }).then(function (res) {
          res.rows.map(function (x) {return x.key; }).should.deep.equal([
            'foobar'
          ], 'test db before replicating');
          return db.replicate.to(db2).then(function () {
            return db.query(queryFun);
          }).then(function (res) {
            res.rows.map(function (x) {return x.key; }).should.deep.equal([
              'foobar'
            ], 'test db after replicating');
            return db.put({
              _id: '_design/other_ddoc',
              views: {
                test: {
                  map: "function(doc) { emit(doc._id); }"
                }
              }
            });
          }).then(function () {
            // the random ddoc adds a single change that we don't
            // care about. testing this increases our coverage
            return db.query(queryFun);
          }).then(function (res) {
            res.rows.map(function (x) {return x.key; }).should.deep.equal([
              'foobar'
            ], 'test db after adding random ddoc');
            return db2.query(queryFun);
          }).then(function (res) {
            res.rows.map(function (x) {return x.key; }).should.deep.equal([
              'foobar'
            ], 'test db2');
          }).catch(function (err) {
            return db2.destroy().then(function () {
              throw err;
            });
          }).then(function () {
            return db2.destroy();
          });
        });
      });
    });

    it('should query correctly after many edits', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          emit(doc.name, doc.likes);
        }
      }).then(function (queryFun) {
        var docs = [
          { _id: '1', name: 'leonardo' },
          { _id: '2', name: 'michelangelo' },
          { _id: '3', name: 'donatello' },
          { _id: '4', name: 'rafael' },
          { _id: '5', name: 'april o\'neil' },
          { _id: '6', name: 'splinter' },
          { _id: '7', name: 'shredder' },
          { _id: '8', name: 'krang' },
          { _id: '9', name: 'rocksteady' },
          { _id: 'a', name: 'bebop' },
          { _id: 'b', name: 'casey jones' },
          { _id: 'c', name: 'casey jones' },
          { _id: 'd', name: 'baxter stockman' },
          { _id: 'e', name: 'general chaos' },
          { _id: 'f', name: 'rahzar' },
          { _id: 'g', name: 'tokka' },
          { _id: 'h', name: 'usagi yojimbo' },
          { _id: 'i', name: 'rat king' },
          { _id: 'j', name: 'metalhead' },
          { _id: 'k', name: 'slash' },
          { _id: 'l', name: 'ace duck' }
        ];

        for (var i = 0; i < 100; i++) {
          docs.push({
            _id: 'z-' + (i + 1000), // for correct string ordering
            name: 'random foot soldier #' + i
          });
        }

        var byId = Object.fromEntries(docs.map((doc) => [doc._id, doc]));

        function update(res, docFun) {
          for (var i  = 0; i < res.length; i++) {
            var doc = byId[res[i].id];
            doc._rev = res[i].rev;
            docFun(doc);
          }
          return db.bulkDocs({docs});
        }
        return db.bulkDocs({docs}).then(function (res) {
          return update(res, function (doc) { doc.likes = 'pizza'; });
        }).then(function (res) {
          return update(res, function (doc) { doc.knows = 'kung fu'; });
        }).then(function (res) {
          return update(res, function (doc) { doc.likes = 'fighting'; });
        }).then(function (res) {
          return update(res, function (doc) { doc._deleted = true; });
        }).then(function (res) {
          return update(res, function (doc) { doc._deleted = false; });
        }).then(function (res) {
          return update(res, function (doc) { doc.name = doc.name + '1'; });
        }).then(function (res) {
          return update(res, function (doc) { doc.name = doc.name + '2'; });
        }).then(function (res) {
          return update(res, function (doc) { doc.name = 'nameless'; });
        }).then(function (res) {
          return update(res, function (doc) { doc._deleted = true; });
        }).then(function (res) {
          return update(res, function (doc) { doc.likes = 'turtles'; });
        }).then(function (res) {
          return update(res, function (doc) { doc._deleted = false; });
        }).then(function (res) {
          return update(res, function (doc) { doc.whatever = 'quux'; });
        }).then(function (res) {
          return update(res, function (doc) { doc.stuff = 'baz'; });
        }).then(function (res) {
          return update(res, function (doc) { doc.things = 'foo'; });
        }).then(function () {
          return db.query(queryFun);
        }).then(function (res) {
          res.total_rows.should.equal(docs.length, 'expected total_rows');
          res.rows.map(function (row) {
            return [row.id, row.key, row.value];
          }).should.deep.equal(docs.map(function (doc) {
            return [doc._id, 'nameless', 'turtles'];
          }), 'key values match');
        });
      });
    });

    it('should query correctly with staggered seqs', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          emit(doc.name);
        }
      }).then(function (queryFun) {
        var docs = [];

        for (var i = 0; i < 200; i++) {
          docs.push({
            _id: 'doc-' + (i + 1000), // for correct string ordering
            name: 'gen1'
          });
        }
        return db.bulkDocs({docs}).then(function (infos) {
          docs.forEach(function (doc) {
            doc._rev = infos.find((info) => info.id === doc._id).rev;
            doc.name = 'gen2';
          });
          docs.reverse();
          return db.bulkDocs({docs});
        }).then(function (infos) {
          docs.forEach(function (doc) {
            doc._rev = infos.find((info) => info.id === doc._id).rev;
            doc.name = 'gen-3';
          });
          docs.reverse();
          return db.bulkDocs({docs});
        }).then(function (infos) {
          docs.forEach(function (doc) {
            doc._rev = infos.find((info) => info.id === doc._id).rev;
            doc.name = 'gen-4-odd';
          });
          var docsToUpdate = docs.filter(function (doc, i) {
            return i % 2 === 1;
          });
          docsToUpdate.reverse();
          return db.bulkDocs({docs: docsToUpdate});
        }).then(function () {
          return db.query(queryFun);
        }).then(function (res) {
          var expected = docs.map(function (doc, i) {
            var key = i % 2 === 1 ? 'gen-4-odd' : 'gen-3';
            return {key, id: doc._id, value: null};
          });
          expected.sort(function (a, b) {
            if (a.key !== b.key) {
              return a.key < b.key ? -1 : 1;
            }
            return a.id < b.id ? -1 : 1;
          });
          res.rows.should.deep.equal(expected);
        });
      });
    });

    it('should handle removes/undeletes/updates', function () {
      var theDoc = {name : 'bar', _id : '1'};

      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.name);
        }
      }).then(function (queryFun) {
        return db.put(theDoc).then(function (info) {
          theDoc._rev = info.rev;
          return db.query(queryFun);
        }).then(function (res) {
          res.rows.length.should.equal(1);
          theDoc._deleted = true;
          return db.post(theDoc);
        }).then(function (info) {
          theDoc._rev = info.rev;
          return db.query(queryFun);
        }).then(function (res) {
          res.rows.length.should.equal(0);
          theDoc._deleted = false;
          delete theDoc._rev;
          return db.put(theDoc);
        }).then(function (info) {
          theDoc._rev = info.rev;
          return db.query(queryFun);
        }).then(function (res) {
          res.rows.length.should.equal(1);
          theDoc.name = 'foo';
          return db.post(theDoc);
        }).then(function (info) {
          theDoc._rev = info.rev;
          return db.query(queryFun);
        }).then(function (res) {
          res.rows.length.should.equal(1);
          res.rows[0].key.should.equal('foo');
          theDoc._deleted = true;
          return db.post(theDoc);
        }).then(function (info) {
          theDoc._rev = info.rev;
          return db.query(queryFun);
        }).then(function (res) {
          res.rows.length.should.equal(0);
        });
      });
    });

    it('should return error when multi-key fetch & group=false', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) { emit(doc._id); },
        reduce: '_sum'
      }).then(function (queryFun) {
        var keys = ['1', '2'];
        var opts = {
          keys,
          group: false
        };
        return db.query(queryFun, opts).then(function (res) {
          should.not.exist(res);
        }).catch(function (err) {
          err.status.should.be.oneOf([400, 500]);
          opts = {keys};
          return db.query(queryFun, opts).then(function (res) {
            should.not.exist(res);
          }).catch(function (err) {
            err.status.should.be.oneOf([400, 500]);
            opts = {keys, reduce : false};
            return db.query(queryFun, opts).then(function () {
              opts = {keys, group: true};
              return db.query(queryFun, opts);
            });
          });
        });
      });
    });

    it('should handle user errors in map functions', function () {
      var db = new PouchDB(dbName);
      var err;
      db.on('error', function (e) { err = e; });
      return createView(db, {
        map : function (doc) {
          emit(doc.nonexistent.foo);
        }
      }).then(function (queryFun) {
        return db.put({name : 'bar', _id : '1'}).then(function () {
          return db.query(queryFun);
        }).then(function (res) {
          res.rows.should.have.length(0);
          if (dbType === 'local') {
            should.exist(err);
          }
        });
      });
    });

    it('should handle user errors in reduce functions', function () {
      var db = new PouchDB(dbName);
      var err;
      db.on('error', function (e) { err = e; });
      return createView(db, {
        map : function (doc) {
          emit(doc.name);
        },
        reduce : function (keys) {
          return keys[0].foo.bar;
        }
      }).then(function (queryFun) {
        return db.put({name : 'bar', _id : '1'}).then(function () {
          return db.query(queryFun, {group: true});
        }).then(function (res) {
          res.rows.map(function (row) {return row.key; }).should.deep.equal(['bar']);
          return db.query(queryFun, {reduce: false});
        }).then(function (res) {
          res.rows.map(function (row) {return row.key; }).should.deep.equal(['bar']);
          if (dbType === 'local') {
            should.exist(err);
          }
        });
      });
    });

    it('should handle reduce returning undefined', function () {
      var db = new PouchDB(dbName);
      var err;
      db.on('error', function (e) { err = e; });
      return createView(db, {
        map : function (doc) {
          emit(doc.name);
        },
        reduce : function () {
        }
      }).then(function (queryFun) {
        return db.put({name : 'bar', _id : '1'}).then(function () {
          return db.query(queryFun, {group: true});
        }).then(function (res) {
          res.rows.map(function (row) {return row.key; }).should.deep.equal(['bar']);
          return db.query(queryFun, {reduce: false});
        }).then(function (res) {
          res.rows.map(function (row) {return row.key; }).should.deep.equal(['bar']);
          should.not.exist(err);
        });
      });
    });

    it('should properly query custom reduce functions', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          emit(doc.name, doc.count);
        },
        reduce : function (keys, values, rereduce) {
          // calculate the average count per name
          if (!rereduce) {
            var result = {
              sum : sum(values),
              count : values.length
            };
            result.average = result.sum / result.count;
            return result;
          } else {
            var thisSum = sum(values.map(function (value) {return value.sum; }));
            var thisCount = sum(values.map(function (value) {return value.count; }));
            return {
              sum : thisSum,
              count : thisCount,
              average : (thisSum / thisCount)
            };
          }
        }
      }).then(function (queryFun) {
        return db.bulkDocs({docs : [
          {name : 'foo', count : 1},
          {name : 'bar', count : 7},
          {name : 'foo', count : 3},
          {name : 'quux', count : 3},
          {name : 'foo', count : 3},
          {name : 'foo', count : 0},
          {name : 'foo', count : 4},
          {name : 'baz', count : 3},
          {name : 'baz', count : 0},
          {name : 'baz', count : 2}
        ]}).then(function () {
          return db.query(queryFun, {group : true});
        }).then(function (res) {
          res.should.deep.equal({rows : [
            {
              key : 'bar',
              value : { sum: 7, count: 1, average : 7}
            },
            {
              key : 'baz',
              value : { sum: 5, count: 3, average: (5 / 3) }
            },
            {
              key : 'foo',
              value : { sum: 11, count: 5, average: (11 / 5) }
            },
            {
              key : 'quux',
              value : { sum: 3, count: 1, average: 3 }
            }
          ]}, 'all');
          return db.query(queryFun, {group : false});
        }).then(function (res) {
          res.should.deep.equal({rows : [
            {
              key : null,
              value : { sum: 26, count: 10, average: 2.6 }
            }
          ]}, 'group=false');
          return db.query(queryFun, {group : true, startkey : 'bar', endkey : 'baz', skip : 1});
        }).then(function (res) {
          res.should.deep.equal({rows : [
            {
              key : 'baz',
              value : { sum: 5, count: 3, average: (5 / 3) }
            }
          ]}, 'bar-baz skip 1');
          return db.query(queryFun, {group : true, endkey : 'baz'});
        }).then(function (res) {
          res.should.deep.equal({rows : [
            {
              key : 'bar',
              value : { sum: 7, count: 1, average : 7}
            },
            {
              key : 'baz',
              value : { sum: 5, count: 3, average: (5 / 3) }
            }
          ]}, '-baz');
          return db.query(queryFun, {group : true, startkey : 'foo'});
        }).then(function (res) {
          res.should.deep.equal({rows : [
            {
              key : 'foo',
              value : { sum: 11, count: 5, average: (11 / 5) }
            },
            {
              key : 'quux',
              value : { sum: 3, count: 1, average: 3 }
            }
          ]}, 'foo-');
          return db.query(queryFun, {group : true, startkey : 'foo', descending : true});
        }).then(function (res) {
          res.should.deep.equal({rows : [
            {
              key : 'foo',
              value : { sum: 11, count: 5, average: (11 / 5) }
            },
            {
              key : 'baz',
              value : { sum: 5, count: 3, average: (5 / 3) }
            },
            {
              key : 'bar',
              value : { sum: 7, count: 1, average : 7}
            }
          ]}, 'foo- descending=true');
          return db.query(queryFun, {group : true, startkey : 'quux', skip : 1});
        }).then(function (res) {
          res.should.deep.equal({rows : [
          ]}, 'quux skip 1');
          return db.query(queryFun, {group : true, startkey : 'quux', limit : 0});
        }).then(function (res) {
          res.should.deep.equal({rows : [
          ]}, 'quux limit 0');
          return db.query(queryFun, {group : true, startkey : 'bar', endkey : 'baz'});
        }).then(function (res) {
          res.should.deep.equal({rows : [
            {
              key : 'bar',
              value : { sum: 7, count: 1, average : 7}
            },
            {
              key : 'baz',
              value : { sum: 5, count: 3, average: (5 / 3) }
            }
          ]}, 'bar-baz');
          return db.query(queryFun, {group : true, keys : ['bar', 'baz'], limit : 1});
        }).then(function (res) {
          res.should.deep.equal({rows : [
            {
              key : 'bar',
              value : { sum: 7, count: 1, average : 7}
            }
          ]}, 'bar & baz');
          return db.query(queryFun, {group : true, keys : ['bar', 'baz'], limit : 0});
        }).then(function (res) {
          res.should.deep.equal({rows : [
          ]}, 'bar & baz limit 0');
          return db.query(queryFun, {group : true, key : 'bar', limit : 0});
        }).then(function (res) {
          res.should.deep.equal({rows : [
          ]}, 'key=bar limit 0');
          return db.query(queryFun, {group : true, key : 'bar'});
        }).then(function (res) {
          res.should.deep.equal({rows : [
            {
              key : 'bar',
              value : { sum: 7, count: 1, average : 7}
            }
          ]}, 'key=bar');
          return db.query(queryFun, {group : true, key : 'zork'});
        }).then(function (res) {
          res.should.deep.equal({rows : [
          ]}, 'zork');
          return db.query(queryFun, {group : true, keys : []});
        }).then(function (res) {
          res.should.deep.equal({rows : [
          ]}, 'keys=[]');
          return db.query(queryFun, {group : true, key : null});
        }).then(function (res) {
          res.should.deep.equal({rows : [
          ]}, 'key=null');
        });
      });
    });

    it('should handle many doc changes', function () {

      var docs = [{_id: '0'}, {_id : '1'}, {_id: '2'}];

      var keySets = [
        [1],
        [2, 3],
        [4],
        [5],
        [6, 7, 3],
        [],
        [2, 3],
        [1, 2],
        [],
        [9],
        [9, 3, 2, 1]
      ];

      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          doc.keys.forEach(function (key) {
            emit(key);
          });
        }
      }).then(function (mapFun) {
        return db.bulkDocs({docs}).then(function () {
          var tasks = keySets.map(function (keys, i) {
            return function () {
              var expectedResponseKeys = [];
              return db.allDocs({
                keys : ['0', '1', '2'],
                include_docs: true
              }).then(function (res) {
                docs = res.rows.map(function (x) { return x.doc; });
                docs.forEach(function (doc, j) {
                  doc.keys = keySets[(i + j) % keySets.length];
                  doc.keys.forEach(function (key) {
                    expectedResponseKeys.push(key);
                  });
                });
                expectedResponseKeys.sort();
                return db.bulkDocs({docs});
              }).then(function () {
                return db.query(mapFun);
              }).then(function (res) {
                var actualKeys = res.rows.map(function (x) {
                  return x.key;
                });
                actualKeys.should.deep.equal(expectedResponseKeys);
              });
            };
          });
          var chain = tasks.shift()();
          function getNext() {
            var task = tasks.shift();
            return task && function () {
              return task().then(getNext());
            };
          }
          return chain.then(getNext());
        });
      });
    });

    it('should handle many doc changes', function () {

      var docs = [{_id: '0'}, {_id : '1'}, {_id: '2'}];

      var keySets = [
        [1],
        [2, 3],
        [4],
        [5],
        [6, 7, 3],
        [],
        [2, 3],
        [1, 2],
        [],
        [9],
        [9, 3, 2, 1]
      ];

      var db = new PouchDB(dbName);
      return createView(db, {
        map : function (doc) {
          doc.keys.forEach(function (key) {
            emit(key);
          });
        }
      }).then(function (mapFun) {
        return db.bulkDocs({docs}).then(function () {
          var tasks = keySets.map(function (keys, i) {
            return function () {
              var expectedResponseKeys = [];
              return db.allDocs({
                keys : ['0', '1', '2'],
                include_docs: true
              }).then(function (res) {
                docs = res.rows.map(function (x) { return x.doc; });
                docs.forEach(function (doc, j) {
                  doc.keys = keySets[(i + j) % keySets.length];
                  doc.keys.forEach(function (key) {
                    expectedResponseKeys.push(key);
                  });
                });
                expectedResponseKeys.sort(function (a, b) {
                  return a - b;
                });
                return db.bulkDocs({docs});
              }).then(function () {
                return db.query(mapFun);
              }).then(function (res) {
                var actualKeys = res.rows.map(function (x) {
                  return x.key;
                });
                actualKeys.should.deep.equal(expectedResponseKeys);
              });
            };
          });
          function getNext() {
            var task = tasks.shift();
            if (task) {
              return task().then(getNext);
            }
          }
          return getNext();
        });
      });
    });

    it('should work with post', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) { emit(doc._id); }
      }).then(async function (mapFun) {
        return db.bulkDocs({docs: [{_id : 'bazbazbazb'}]}).then(function () {
          var keys = ['bazbazbazb'];
          return db.query(mapFun, {keys}).then(function (resp) {
            resp.total_rows.should.equal(1);
            resp.rows.should.have.length(1);
            return resp.rows.every(function (row) {
              return row.id === 'bazbazbazb' && row.key === 'bazbazbazb';
            });
          });
        }).should.become(true);
      });
    });

    it("should accept trailing ';' in a map definition (#178)", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: "function(doc){};\n"
      }).then(function (queryFun) {
        return db.query(queryFun);
      }).should.become({
        offset: 0,
        rows: [],
        total_rows: 0
      });
    });

    it('should throw a 404 when no funcs found in ddoc (#181)', function () {
      var db = new PouchDB(dbName);
      return db.put({
        _id: '_design/test'
      }).then(function () {
        return db.query('test/unexisting');
      }).then(function () {
        //shouldn't happen
        true.should.equal(false);
      }).catch(function (err) {
        err.status.should.be.oneOf([404, 500]);
      });
    });

    it('should continue indexing when map eval fails (#214)', function () {
      var db = new PouchDB(dbName);
      var err;
      db.on('error', function (e) {
        err = e;
      });
      return createView(db, {
        map: function (doc) {
          emit(doc.foo.bar, doc);
        }
      }).then(function (view) {
        return db.bulkDocs({docs: [
          {
            foo: {
              bar: "foobar"
            }
          },
          { notfoo: "thisWillThrow" },
          {
            foo: {
              bar: "otherFoobar"
            }
          }
        ]}).then(function () {
          return db.query(view);
        }).then(function (res) {
          if (dbType === 'local') {
            should.exist(err);
          }
          res.rows.should.have.length(2, 'Ignore the wrongly formatted doc');
          return db.query(view);
        }).then(function (res) {
          res.rows.should.have.length(2, 'Ignore the wrongly formatted doc');
        });

      });
    });

    it('should continue indexing when map eval fails, ' +
        'even without a listener (#214)', function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.foo.bar, doc);
        }
      }).then(function (view) {
        return db.bulkDocs({docs: [
          {
            foo: {
              bar: "foobar"
            }
          },
          { notfoo: "thisWillThrow" },
          {
            foo: {
              bar: "otherFoobar"
            }
          }
        ]}).then(function () {
          return db.query(view);
        }).then(function (res) {
          res.rows.should.have.length(2, 'Ignore the wrongly formatted doc');
          return db.query(view);
        }).then(function (res) {
          res.rows.should.have.length(2, 'Ignore the wrongly formatted doc');
        });

      });
    });

    it('should update the emitted value', function () {
      var db = new PouchDB(dbName);
      var docs = [];
      for (var i = 0; i < 300; i++) {
        docs.push({
          _id: i.toString(),
          name: 'foo',
          count: 1
        });
      }

      return createView(db, {
        map: "function(doc){emit(doc.name, doc.count);};\n"
      }).then(function (queryFun) {
        return db.bulkDocs({docs}).then(function (res) {
          for (var i = 0; i < res.length; i++) {
            docs[i]._rev = res[i].rev;
          }
          return db.query(queryFun);
        }).then(function (res) {
          var values = res.rows.map(function (x) { return x.value; });
          values.should.have.length(docs.length);
          values[0].should.equal(1);
          docs.forEach(function (doc) {
            doc.count = 2;
          });
          return db.bulkDocs({docs});
        }).then(function () {
          return db.query(queryFun);
        }).then(function (res) {
          var values = res.rows.map(function (x) { return x.value; });
          values.should.have.length(docs.length);
          values[0].should.equal(2);
        });
      });
    });

    it('#6230 Test db.query() opts update_seq: false', function () {
      var db = new PouchDB(dbName);
      var docs = [];
      for (var i = 0; i < 4; i++) {
        docs.push({
          _id: i.toString(),
          name: 'foo',
        });
      }
      return createView(db, {
        map: "function(doc){emit(doc.name);};\n"
      }).then(function (queryFun) {
        return db.bulkDocs({ docs }).then(function () {
          return db.query(queryFun, { update_seq: false });
        }).then(function (result) {
          result.rows.should.have.length(4);
          should.not.exist(result.update_seq);
        });
      });
    });


    it('#6230 Test db.query() opts update_seq: true', function () {

      var db = new PouchDB(dbName);
      var docs = [];
      for (var i = 0; i < 4; i++) {
        docs.push({
          _id: i.toString(),
          name: 'foo',
        });
      }

      return db.bulkDocs({ docs }).then(function () {
        return createView(db, {
          map: "function(doc){emit(doc.name);};\n"
        });
      }).then(function (queryFun) {
        return db.query(queryFun, { update_seq: true });
      }).then(function (result) {
        result.rows.should.have.length(4);
        should.exist(result.update_seq);
        result.update_seq.should.satisfy(function (update_seq) {
          if (typeof update_seq === 'number' || typeof update_seq === 'string') {
            return true;
          } else {
            return false;
          }
        });
        var normSeq = normalizeSeq(result.update_seq);
        normSeq.should.be.a('number');
      });

      function normalizeSeq(seq) {
        try {
          if (typeof seq === 'string' && seq.indexOf('-') > 0) {
            return parseInt(seq.substring(0, seq.indexOf('-')));
          }
          return seq;
        } catch (err) {
          return seq;
        }
      }
    });

    it('#6230 Test db.query() opts with update_seq missing', function () {
      var db = new PouchDB(dbName);
      var docs = [];
      for (var i = 0; i < 4; i++) {
        docs.push({
          _id: i.toString(),
          name: 'foo',
        });
      }
      return createView(db, {
        map: "function(doc){emit(doc.name);};\n"
      }).then(function (queryFun) {
        return db.bulkDocs({ docs }).then(function () {
          return db.query(queryFun);
        }).then(function (result) {
          result.rows.should.have.length(4);
          should.not.exist(result.update_seq);
        });
      });
    });

    it("#8370 keys queries should support skip and limit", function () {
      var db = new PouchDB(dbName);
      return createView(db, {
        map: function (doc) {
          emit(doc.field);
        }
      }).then(function (queryFun) {
        var opts = {include_docs: true};
        return db.bulkDocs({
          docs: [
            { _id: "doc_0", field: 0 },
            { _id: "doc_1", field: 1 },
            { _id: "doc_2", field: 2 },
            { _id: "doc_3", field: 3 },
          ]
        }).then(function () {
          opts.keys = [1, 0, 3, 2];
          opts.limit = 2;
          return db.query(queryFun, opts);
        }).then(function (data) {
          data.rows.should.have.length(2, "returns 2 docs due to limit");
          data.rows[0].doc._id.should.equal("doc_1");
          data.rows[1].doc._id.should.equal("doc_0");
          delete opts.limit;
          opts.skip = 2;
          return db.query(queryFun, opts);
        }).then(function (data) {
          data.rows.should.have.length(2, "returns 2 docs due to skip");
          data.rows[0].doc._id.should.equal("doc_3");
          data.rows[1].doc._id.should.equal("doc_2");
          opts.limit = 2;
          opts.skip = 3;
          return db.query(queryFun, opts);
        }).then(function (data) {
          data.rows.should.have.length(1, "returns 1 doc due to limit and skip");
          data.rows[0].doc._id.should.equal("doc_2");
        });
      });
    });
  });
}
