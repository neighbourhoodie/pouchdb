/*
This snippet is to demonstrate that core data and indexing data can be stored
in separate adapters
*/


// const PouchDB = require('pouchdb')

const PouchDB = require('./packages/node_modules/pouchdb')
// PouchDB.plugin(require('pouchdb-adapter-cordova-sqlite'))

const DB_NAME = 'pouch-adapter-test'

const db = new PouchDB(DB_NAME)
// const db = new PouchDB(DB_NAME, {adapter: 'idb', view_adapter: 'cordova-sqlite'})
console.log('*** adapter', db.adapter)

Promise.resolve().then(async () => {
  // await db.put({ _id: 'doc1', title: 'abc', value: 1 })
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
}).catch((err) => {
  console.log(err)
}).then(() => {
  return db.destroy()
})
