#!/bin/bash
# Git review script - opens all changed files for review
# Usage: ./examples/git-review.sh | node diffy-cli.mjs

echo "# Opening all files changed vs main branch"

# Get list of changed files
git diff --name-only main..HEAD | head -10 | nl | while read num file; do
  # Alternate between left (0) and right (1) panels
  panel=$((($num - 1) % 2))
  echo "open $file $panel main"
  
  # Highlight first 10 lines of each file
  echo "highlight $file 1 10"
done

echo "refresh"
echo "# Review complete - press Ctrl+C to exit or type 'exit'"