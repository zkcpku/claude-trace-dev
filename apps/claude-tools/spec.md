/# Claude Traffic Logger Architecture

A sophisticated traffic analysis tool for Claude Code that intercepts HTTP requests, processes conversation flows, and generates interactive HTML reports with advanced conversation merging capabilities.

## System Overview

The Claude traffic logger consists of three main components:

1. **Backend Traffic Interceptor** (`claude-logger.py`) - mitmproxy-based HTTP interceptor
2. **Frontend Template System** (`template/`) - Modular HTML/CSS/JS components
3. **Conversation Processing Engine** (`script.js`) - Complex algorithm for merging and analyzing conversations

## Architecture Components

### Backend: Traffic Interception (`claude-logger.py`)

**Purpose**: Intercept and log Claude API traffic using mitmproxy

**Key Features**:

- Thread-safe request/response pairing using flow IDs
- Race condition protection for parallel API calls
- SSE (Server-Sent Events) streaming response handling
- Real-time HTML generation with embedded templates
- JSONL output format for data persistence

**Data Flow**:

```
Claude Code → mitmproxy (port 8080) → claude-logger.py → claude-traffic.jsonl
                                                        → claude-traffic.html
```

### Frontend: Template System (`template/`)

**Modular Architecture**:

- `index.html` - Main structure with placeholder injection points
- `styles.css` - Complete responsive styling system
- `views.js` - ClaudeViewRenderer class for UI rendering
- `script.js` - ClaudeViewer class for data processing and conversation merging

**Template Injection System**:

```javascript
// Python merges all template files into single standalone HTML
html_content = html_template.replace("{{CSS_CONTENT}}", css_content);
html_content = html_content.replace("{{VIEWS_JS_CONTENT}}", views_js_content);
html_content = html_content.replace("{{MAIN_JS_CONTENT}}", main_js_content);
html_content = html_content.replace("{{DATA_JSON}}", data_json_escaped);
```

### Data Processing: Conversation Engine (`script.js`)

The core of the system - a sophisticated algorithm that processes raw API call pairs into coherent conversation flows.

## The Conversation Merging Algorithm

### Problem Statement

Claude Code clients exhibit complex conversation patterns:

1. **Normal Conversations**: Multiple API calls building a conversation incrementally
2. **Compact Conversations**: Client occasionally "compacts" long conversations by:
   - Taking current conversation messages (now including the last assistant response)
   - Modifying the first user message slightly
   - Appending a summarization request
   - Sending to LLM for summarization
   - Starting new conversation with summary as first user message

### Algorithm Overview

The conversation merging process happens in multiple phases:

#### Phase 1: System-Based Grouping

```javascript
// Group pairs by system instructions + model to prevent cross-contamination
const pairsBySystem = new Map();
const systemKey = JSON.stringify({ system, model });
```

**Why**: Different system messages represent different conversation contexts and should never be merged.

#### Phase 2: Thread-Based Conversation Detection

```javascript
// Within each system group, detect conversation threads by first user message
const conversationThreads = new Map(); // Maps message hash -> array of pairs
const conversationKey = JSON.stringify({ firstMessage: normalizedFirstMessage });
```

**Message Normalization**:

- Remove timestamps: `Generated [TIMESTAMP]`
- Normalize file references: `The user opened file in IDE`
- Strip system reminders: `<system-reminder>...</system-reminder>`

#### Phase 3: Temporal Sorting and Conversation Building

```javascript
// Sort pairs chronologically within each thread
const sortedThreadPairs = [...threadPairs].sort((a, b) => a.request.timestamp - b.request.timestamp);

// Find the pair with longest message history (most complete conversation)
const finalPair = sortedThreadPairs.reduce((longest, current) => {
	return current.messages.length > longest.messages.length ? current : longest;
});
```

**Timestamp Handling**:

- `startTime`: First pair's request timestamp
- `endTime`: Final pair's response timestamp (fallback to request timestamp)
- All pairs within conversation are sorted chronologically

#### Phase 4: Compact Conversation Detection and Merging

**Detection Logic**:

```javascript
// 1. Find conversations with exactly 1 pair (likely compact conversations)
if (currentConv.pairs.length === 1) {
	// 2. Look for original conversations with exactly 2 fewer messages
	if (otherConv.messages.length === currentConv.messages.length - 2) {
		// 3. Verify all messages except first match between conversations
		for (let k = 1; k < otherConv.messages.length; k++) {
			if (!messagesRoughlyEqual(otherConv.messages[k], currentConv.messages[k])) {
				messagesMatch = false;
				break;
			}
		}
	}
}
```

**Why This Works**:

- Compact conversations add exactly 2 messages: summarization request + summary response
- Client modifies first user message, so we can't match on it
- All other messages remain identical between original and compact versions
- System message also gets modified, so we can't match on that either

**Merging Process**:

```javascript
// 1. Take all messages from compact conversation (contains full flow)
const mergedMessages = [...compactMessages];

// 2. Replace first message with original (unmodified) version
mergedMessages[0] = currentMessages[0];

// 3. Use original system message (unmodified)
system: currentConv.system,

// 4. Combine and sort all pairs chronologically
const allPairs = [...currentConv.pairs, ...compactConv.pairs]
    .sort((a, b) => a.request.timestamp - b.request.timestamp);
```

### Message Comparison Algorithm

```javascript
messagesRoughlyEqual(msg1, msg2) {
    if (msg1.role !== msg2.role) return false;

    // Check content type compatibility
    if (typeof msg1.content !== typeof msg2.content) return false;
    if (Array.isArray(msg1.content) !== Array.isArray(msg2.content)) return false;

    // For now, assume match if roles and content types align
    // Could be enhanced with deeper content analysis
    return true;
}
```

**Future Enhancement Opportunities**:

- Deep content comparison for text blocks
- Tool use parameter matching
- Fuzzy string matching for minor variations

## Data Structures

### Conversation Object

```javascript
{
    model: "claude-3-5-sonnet-20241022",
    system: "You are Claude Code...",
    messages: [
        { role: "user", content: "..." },
        { role: "assistant", content: [...] }
    ],
    latestResponse: { content: [...], usage: {...} },
    pairs: [ /* All API call pairs for this conversation */ ],
    metadata: {
        startTime: "2025-01-30T...",
        endTime: "2025-01-30T...",
        totalPairs: 3,
        totalTokens: 1250,
        usage: {
            input_tokens: 800,
            output_tokens: 450,
            cache_read_input_tokens: 200,
            cache_creation_input_tokens: 100
        }
    }
}
```

### Pair Object (JSONL format)

```javascript
{
    request: {
        timestamp: 1706123456.789,
        method: "POST",
        url: "https://api.anthropic.com/v1/messages",
        headers: {...},
        body: {
            model: "claude-3-5-sonnet-20241022",
            system: "...",
            messages: [...]
        }
    },
    response: {
        timestamp: 1706123458.123,
        status_code: 200,
        headers: {...},
        body: {...}, // Structured response
        body_raw: "event: message_start\ndata: {...}\n\n..." // SSE format
    },
    logged_at: "2025-01-30T..."
}
```

## Token Tracking System

**Multi-Source Token Extraction**:

- Structured JSON responses (`response.body.usage`)
- SSE streaming responses (parsed from `message_start` and `message_delta` events)
- Cache token metrics (`cache_read_input_tokens`, `cache_creation_input_tokens`)

**Aggregation**:

- Per-conversation totals across all merged pairs
- Input/output token breakdown
- Cache efficiency metrics

## Model Filtering System

**Default Behavior**:

- Haiku model requests hidden by default (cosmetic/title generation)
- Real-time filtering with conversation count updates
- Maintains filter state across view switches

**Implementation**:

```javascript
// Filter conversations and re-render
const filteredPairs = this.data.rawPairs.filter((pair) => {
	const model = pair.request.body?.model || "unknown";
	return this.modelFilters.has(model);
});
```

## SSE (Server-Sent Events) Processing

**Parsing Logic**:

```javascript
parseSSEToEvents(sseData) {
    const events = [];
    const lines = sseData.trim().split("\n");
    let currentEvent = {};

    for (const line of lines) {
        if (line.startsWith("event: ")) {
            currentEvent.event = line.substring(7);
        } else if (line.startsWith("data: ")) {
            const dataStr = line.substring(6);
            currentEvent.data_raw = dataStr;
            try {
                currentEvent.data_parsed = JSON.parse(dataStr);
            } catch { /* Handle non-JSON data */ }
        }
    }
    return events;
}
```

**Event Types Handled**:

- `message_start` - Contains input token counts and message metadata
- `content_block_delta` - Text deltas for streaming response
- `message_delta` - Contains output token counts

## Performance Optimizations

**Thread Safety**:

- All request/response pairing uses flow IDs to prevent race conditions
- Thread-safe file writing with locks

**Memory Management**:

- Streaming HTML generation (don't store all conversations in memory)
- Efficient JSONL processing line-by-line

**UI Rendering**:

- Lazy loading of conversation details
- Efficient DOM updates for filtering

## Error Handling and Edge Cases

**Orphaned Requests**: Logged separately if no matching response received
**Malformed JSON**: Graceful degradation with `body_raw` fallback
**Missing Timestamps**: Fallback to request timestamp for response timing
**Empty Conversations**: Filtered out during processing
**Concurrent API Calls**: Proper flow ID tracking prevents mis-pairing

## Usage Patterns and Testing

**Development Workflow**:

```bash
# Test with sample data
python3 claude-logger.py test-traffic.jsonl

# Live monitoring
./claude-logger.sh

# Generate from existing logs
python3 claude-logger.py my-session.jsonl
```

**Debugging**:

- Console logging for conversation merging decisions
- Raw pairs view for detailed API inspection
- SSE event structure display

## Future Enhancement Ideas

1. **Enhanced Message Matching**: Deep content comparison beyond role/type checking
2. **Conversation Branching**: Detect and visualize conversation forks
3. **Performance Metrics**: Response time analysis and bottleneck detection
4. **Export Capabilities**: JSON/CSV export of processed conversations
5. **Search and Filtering**: Full-text search across conversation content
6. **Diff Visualization**: Show exact changes in compact conversation first messages
7. **Token Cost Analysis**: Cost calculations based on model pricing
8. **Session Grouping**: Group conversations by user session or time windows

## Frontend Design Philosophy

**Clean Modern Interface**: The interface uses a focused, readable design with consistent styling and semantic color coding.

### Design Principles

**Layout Structure**:

- Centered 600px max-width containers for optimal readability
- Clear visual hierarchy with bordered sections
- Consistent spacing using em units (1em, 2em, 4em)
- Proper content separation and grouping

**Typography**:

- Monospace font family for consistent character spacing
- Single font size for uniformity
- Bold text for emphasis on role labels and headers
- Uppercase USER/ASSISTANT labels for clarity

**Color Palette (15 colors)**:

- **Background**: Dark (#1e1e1e) with darker code blocks (#2d2d30)
- **Text**: Light gray (#d4d4d4) with dimmed secondary text (#8c8c8c)
- **Borders**: Standard gray (#3e3e42), orange conversation headers (#8b6914)
- **UI Elements**: Blue expandable headers (#569cd6), yellow tool names/nav (#dcdcaa)
- **Message Roles**: Green USER (#6a9955), orange ASSISTANT (#ce9178)
- **Tool States**: Teal success (#4ec9b0), red errors/active states (#f48771)
- **Interactive**: White hover states (#ffffff)

**Content Organization**:

- Expandable sections for system prompts and tool definitions
- Collapsible tool calls with parameter/result display
- Word wrapping for long content with proper overflow handling
- Whitespace preservation for code/JSON content

**Interactive Elements**:

- Click-to-expand for detailed content
- Model filtering across both conversation and raw views
- Navigation between conversations and raw calls views
- Visual indicators for compacted conversations

**Visual Hierarchy**:

- Bordered containers for logical grouping
- Color-coded message types and states
- Consistent spacing between sections
- Clear active/inactive state differentiation

## Technical Notes

**Browser Compatibility**: Modern ES6+ features used (Map, Set, arrow functions)
**Responsive Design**: Terminal-style responsive design with text truncation
**Accessibility**: Semantic HTML structure with proper heading hierarchy
**Security**: HTML escaping for all user content to prevent XSS

This architecture successfully handles the complex conversation patterns exhibited by Claude Code while providing a clean, authentic terminal interface for analyzing API traffic and understanding conversation flows.

## Development

When the user asks you to modify the frontend and you've completed the task, regenerate the HTML and open the .html file

`python3 claude-logger.py test-traffic.jsonl & open claude-traffic.html`
