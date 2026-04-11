#!/bin/bash
# Remove .kiro directory from git staging area
git rm --cached -r .kiro/
echo ".kiro/ has been removed from git staging area"
echo "Run 'git status' to verify"
