#!/bin/bash
which node >/dev/null && which npm  >/dev/null || echo "please install node.js - see https://github.com/tj/n for help with that"
which npm  >/dev/null  && npm install
which npm  >/dev/null  && which ace-express && npm remove -g
which npm  >/dev/null  && npm install -g
