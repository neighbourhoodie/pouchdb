import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('./_pouch_foo')
// db.exec(`DROP TABLE IF EXISTS data`)
// db.exec(`
//   CREATE TABLE data (
//     key INTEGER PRIMARY KEY,
//     value TEXT
//   ) STRICT
// `)
const stmt = db.prepare(`SELECT 'by-sequence'.seq AS seq, 'by-sequence'.deleted AS deleted, 'by-sequence'.json AS data, 'by-sequence'.rev AS rev, 'document-store'.json AS metadata FROM 'document-store' JOIN 'by-sequence' ON 'by-sequence'.seq = 'document-store'.winningseq WHERE 'document-store'.id=?`)
const meta = stmt.run('d1')
console.log(stmt.sourceSQL)
console.log(stmt.expandedSQL)
console.log('meta', meta)

const res = stmt.all('d1')
console.log('res', res)

// db.exec('BEGIN TRANSACTION')
// const insert = db.prepare('INSERT INTO data (key, value) VALUES (?, ?)')
// insert.run(1, 'hello')
// const res = insert.run(2, 'world')
// 
// const query = db.prepare('SELECT * FROM data ORDER BY key')
// // Execute the prepared statement and log the result set.
// console.log(query.all())
// db.exec('ROLLBACK')
// const query2 = db.prepare('SELECT * FROM data ORDER BY key')
// // Execute the prepared statement and log the result set.
// console.log(query2.all())
