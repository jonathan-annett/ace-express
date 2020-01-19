#!/bin/bash

./update_git_repos.sh

if [[ "${NEW_DIFF}" == "1" ]]; then
  npm install
  git add package.json
fi
git add index.js
if [[ "$1" == "" ]];then
 git commit -m "auto updated"
else
 git commit
fi
git push
git rev-parse HEAD
