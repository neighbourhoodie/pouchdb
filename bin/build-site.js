#!/usr/bin/env node

'use strict';

const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').exec);

var fs = require('fs');

process.chdir('./');

async function buildCSS() {
  await exec('npm run build:less');
  console.log('=> Rebuilt CSS');
}

async function buildEleventy() {
  await exec('eleventy');
  await checkForUnprocessedCurlies();
  console.log('=> Rebuilt eleventy');
}

async function checkForUnprocessedCurlies() {
  // If unprocessed curlies are ever desired, add a way to ignore them.
  try {
    const res = await exec(`grep -Ern --include=\\*.html '\\{\\{|\\}\\}' ./_site/`);

    console.log();
    console.log('!!! UNPROCESSED CURLIES FOUND IN OUTPUT HTML FILE(S):');
    console.log(res.stdout.trim());
    console.log('!!! CHECK TEMPLATES ARE BEING FULLY PROCESSED.');
    console.log();

    if (process.env.BUILD) {
      process.exit(1);
    }
  } catch (err) {
    if (err.code === 1) {
      return; // no problems found
    }
    throw err;
  }
}

async function buildEverything() {
  try {
    await buildCSS();
    await buildEleventy();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (!process.env.BUILD) {
  const http_server = require('http-server');
  const globWatcher = require('glob-watcher');
  const watchGlob = (path, fn) => globWatcher(path, () => fn().catch(console.log));

  // Simpler ways of blacklisting certain paths here would be very welcome.
  fs.readdirSync('./docs')
    .forEach(path => {
      if (path === '_site') {
        return;
      }

      if (fs.statSync(`./docs/${path}`).isDirectory()) {
        watchGlob(`./docs/${path}/**`, buildEleventy);
      } else {
        watchGlob(`./docs/${path}`, buildEleventy);
      }
    });


  watchGlob('./docs/src/less/**', buildCSS);

  http_server.createServer({root: './docs/_site', cache: '-1'}).listen(4000);
  console.log('Server address: http://localhost:4000');
}

buildEverything();
