# Publishing Checklist for @mariozechner/snap-happy

## Pre-Publish Checklist

- [x] Package.json properly configured with all metadata
- [x] TypeScript configured for ES modules
- [x] License file created (MIT)
- [x] README.md updated with usage instructions
- [x] All tests pass (`npm run test:config`, `npm run test:e2e`)
- [x] Build works correctly (`npm run build`)
- [x] Built package tested (`node dist/index.js`)
- [x] .npmignore configured to exclude source files
- [x] Package preview looks correct (`npm pack --dry-run`)

## Publishing Steps

1. **Ensure you're logged into npm**:

   ```bash
   npm whoami
   # If not logged in:
   npm login
   ```

2. **Final version check**:

   ```bash
   npm version --no-git-tag-version patch  # or minor/major
   ```

3. **Final test**:

   ```bash
   npm run test:e2e
   ```

4. **Publish to npm**:

   ```bash
   npm publish --access public
   ```

5. **Verify publication**:

   ```bash
   npm info @mariozechner/snap-happy
   ```

6. **Test global installation**:
   ```bash
   npm install -g @mariozechner/snap-happy
   snap-happy --help  # Should show help or start server
   ```

## Post-Publish

- [ ] Update GitHub repository with release tag
- [ ] Update main README.md with installation instructions
- [ ] Test with Claude Code integration
- [ ] Share on relevant communities/forums

## Version Information

- **Current Version**: 1.0.0
- **Dependencies**: @modelcontextprotocol/sdk@^1.12.1
- **Node.js Support**: ES2022+
- **Package Size**: ~12.2 kB compressed, ~40.2 kB unpacked

## Quick Test Commands

```bash
# Test configuration
npm run test:config

# Test end-to-end
npm run test:e2e

# Test built version
node dist/index.js &
sleep 2
kill %1

# Preview package contents
npm pack --dry-run
```

## Claude Integration Test

After publishing, test with Claude:

```bash
# Install globally
npm install -g @mariozechner/snap-happy

# Add to Claude
claude mcp add snap-happy snap-happy

# Test with Claude
echo "Take a screenshot" | claude -p
```
