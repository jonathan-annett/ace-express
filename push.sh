#!/bin/bash
NEW_REPOS=0
./update_git_repos.sh && NEW_REPOS=1

if [[ "${NEW_REPOS}" == "1" ]]; then
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
