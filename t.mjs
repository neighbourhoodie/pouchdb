import PouchDB from './packages/node_modules/pouchdb/lib/index.js'
import NodeSQLitePouch from './packages/node_modules/pouchdb-adapter-nodesqlite/lib/index.js'
PouchDB.plugin(NodeSQLitePouch)

const db = new PouchDB('foo', { adapter: 'nodesqlite' })
// console.log(db)
const d1 = { _id: 'd1', a: 1 }
db.on('debug', (msg) => {
  console.log('DEBUG: ', msg)
})

async function main () {
  console.log('> main')
  const r1 = await db.put(d1)
  console.log(r1)
  const r2 = await db.get('d1')
  console.log(r2)
  console.log('< main')
}

try {
  main()
} catch (error) {
  console.log('main error', error)
}
console.log('done')

// import EventEmitter from 'events';
// 
// const e = new EventEmitter()
// 
// e.on('foo', (ev) => console.log('got', ev))
// e.emit('foo', 1)
