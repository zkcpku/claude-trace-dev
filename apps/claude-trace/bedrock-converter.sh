INPUT_JSONL=$1
node bedrock-converter.js $INPUT_JSONL > converted.jsonl
node --no-deprecation /Users/zhangkechi/Documents/GitHub/claude-trace-dev/apps/claude-trace/dist/cli.js --include-all-requests --generate-html converted.jsonl