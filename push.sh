#!/bin/bash
git add *
if [[ "$1" == "" ]];then
 git commit -m "auto updated"
else
 git commit
fi
git push
git rev-parse HEAD
