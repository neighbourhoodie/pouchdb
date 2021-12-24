#!/bin/bash

: ${TIMEOUT:=120000}
: ${REPORTER:="spec"}
: ${BAIL:=1}
: ${TYPE:="integration"}

if [ $BAIL -eq 1 ]; then
    BAIL_OPT="--bail"
else
    BAIL_OPT=""
fi

if [ $TYPE = "integration" ]; then
    node bin/down-server.js 3010 & export DOWN_SERVER_PID=$!

    TESTS_PATH="tests/integration/test.*.js"
fi
if [ $TYPE = "replication" ]; then
    TESTS_PATH="tests/replication/test.*.js"
fi
if [ $TYPE = "fuzzy" ]; then
    TESTS_PATH="tests/fuzzy/test.*.js"
fi
if [ $TYPE = "mapreduce" ]; then
    TESTS_PATH="tests/mapreduce/test.*.js"
fi
if [ $TYPE = "find" ]; then
    TESTS_PATH="tests/find/*/test.*.js"
fi
if [ $COVERAGE ]; then
    # run all tests when testing for coverage
    TESTS_PATH="tests/{unit,integration,mapreduce,component,replication}/test*.js tests/find/*/test.*.js"
fi

if [ $PERF ]; then
    node tests/performance/index.js
elif [ ! $COVERAGE ]; then
    ./node_modules/.bin/mocha \
        $BAIL_OPT \
        --timeout "$TIMEOUT" \
        --require=./tests/integration/node.setup.js \
        --reporter="$REPORTER" \
        --grep="$GREP" \
        $TESTS_PATH
else
    ./node_modules/.bin/istanbul cover \
       --no-default-excludes -x 'tests/**' -x 'node_modules/**' \
       ./node_modules/mocha/bin/_mocha -- \
        $BAIL_OPT \
        --timeout "$TIMEOUT" \
        --require=./tests/integration/node.setup.js \
        --reporter="$REPORTER" \
        --grep="$GREP" \
        $TESTS_PATH

    ./node_modules/.bin/istanbul check-coverage --line 100
fi

EXIT_STATUS=$?
if [[ ! -z $DOWN_SERVER_PID ]]; then
  kill $DOWN_SERVER_PID
fi
exit $EXIT_STATUS
