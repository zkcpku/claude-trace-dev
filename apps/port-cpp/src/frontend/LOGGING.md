# Frontend Logging Configuration

The file viewer frontend now uses a configurable logging system. **By default, all logging is disabled** for performance and cleaner console output.

## How to Enable Logging

### 1. URL Parameters (Temporary)

**Enable all logging:**

```
http://localhost:PORT/?debug=true
```

**Enable specific log levels:**

```
http://localhost:PORT/?log=error,warn
http://localhost:PORT/?log=log,error
```

Available levels: `log`, `error`, `warn`, `info`, `debug`

### 2. Browser Console (Runtime)

**Enable all logging:**

```javascript
fileViewerLogger.enableAll();
```

**Enable specific levels:**

```javascript
fileViewerLogger.enable("error");
fileViewerLogger.enable("warn");
```

**Disable logging:**

```javascript
fileViewerLogger.disableAll();
fileViewerLogger.disable("error");
```

**Check current configuration:**

```javascript
fileViewerLogger.getConfig();
```

**Custom configuration:**

```javascript
fileViewerLogger.configure({
	enabled: true,
	levels: {
		log: true,
		error: true,
		warn: false,
		info: false,
		debug: false,
	},
});
```

### 3. Persistent Configuration

Settings are automatically saved to localStorage and persist across browser sessions.

## Log Categories

The logging system captures:

- **General logs** (`log`): App initialization, file operations, UI state changes
- **Errors** (`error`): WebSocket failures, file loading errors, Monaco editor issues
- **Warnings** (`warn`): Missing elements, invalid parameters
- **Info** (`info`): Currently unused
- **Debug** (`debug`): Currently unused

## Examples

**For development - enable all logging:**

```javascript
fileViewerLogger.enableAll();
```

**For production debugging - only errors:**

```javascript
fileViewerLogger.configure({ enabled: true, levels: { error: true } });
```

**Quick temporary debugging via URL:**

```
http://localhost:61408/?debug=true
```
