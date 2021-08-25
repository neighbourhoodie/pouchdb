'use strict';

var PouchDB = require('../../packages/node_modules/pouchdb');

var app = require('express-pouchdb')(PouchDB, {
  mode: 'minimumForPouchDB'
});
app.listen(3000);
