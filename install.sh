#!/bin/bash
which node && which npm || echo "please install node.js"
which npm && npm install
which npm && which ace-express && npm remove -g
which npm && install -g
