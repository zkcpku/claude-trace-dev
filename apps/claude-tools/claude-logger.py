#!/usr/bin/env python3
"""
Claude Code Traffic Logger
Logs all traffic while allowing interactive use of Claude Code
"""

import json
import time
import html
import re
from datetime import datetime
from mitmproxy import http

class ClaudeTrafficLogger:
    def __init__(self):
        timestamp = int(time.time())
        self.log_file = f"claude-traffic-{timestamp}.log"
        self.html_file = f"claude-traffic-{timestamp}.html"
        self.conversations = []
        self.pending_requests = {}  # Maps request-id to request data
        self.orphaned_requests = []  # Requests without responses
        # Don't print to stdout as it interferes with Claude's TUI
    
    def log_request(self, flow: http.HTTPFlow):
        """Store HTTP request details for pairing with response"""
        req = flow.request
        
        # Format request info
        request_info = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "type": "REQUEST",
            "method": req.method,
            "url": req.pretty_url,
            "headers": dict(req.headers),
            "content_length": len(req.content) if req.content else 0
        }
        
        # Add body if it's JSON or text
        if req.content:
            content_type = req.headers.get("content-type", "").lower()
            if "json" in content_type:
                try:
                    request_info["body"] = json.loads(req.content.decode('utf-8'))
                except:
                    request_info["body_raw"] = req.content.decode('utf-8', errors='ignore')
            elif "text" in content_type or "xml" in content_type:
                request_info["body_raw"] = req.content.decode('utf-8', errors='ignore')
        
        # Store request for matching with response
        if "/v1/messages" in req.pretty_url or "/chat/completions" in req.pretty_url:
            # Generate a unique request ID for this flow
            request_id = id(flow)
            self.pending_requests[request_id] = request_info
            # Store flow reference for response matching
            flow.request_id = request_id
        else:
            # For non-API requests, log immediately
            self.write_log(request_info)
    
    def log_response(self, flow: http.HTTPFlow):
        """Log HTTP response details and pair with request"""
        resp = flow.response
        
        # Format response info
        response_info = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "type": "RESPONSE",
            "status_code": resp.status_code,
            "headers": dict(resp.headers),
            "content_length": len(resp.content) if resp.content else 0
        }
        
        # Add body if it's JSON or text
        if resp.content:
            content_type = resp.headers.get("content-type", "").lower()
            if "json" in content_type:
                try:
                    response_info["body"] = json.loads(resp.content.decode('utf-8'))
                except:
                    response_info["body_raw"] = resp.content.decode('utf-8', errors='ignore')
            elif "text" in content_type or "event-stream" in content_type:
                response_info["body_raw"] = resp.content.decode('utf-8', errors='ignore')
        
        # Try to match request with response
        if hasattr(flow, 'request_id') and flow.request_id in self.pending_requests:
            request_info = self.pending_requests.pop(flow.request_id)
            
            # Get request ID from response header if available
            anthropic_request_id = resp.headers.get('request-id')
            if anthropic_request_id:
                response_info["anthropic_request_id"] = anthropic_request_id
            
            # Create request-response pair
            pair = {
                "timestamp": request_info["timestamp"],
                "request": request_info,
                "response": response_info
            }
            
            # Log the complete pair
            self.write_log_pair(pair)
            
            # Add to conversations for HTML generation
            if "/v1/messages" in flow.request.pretty_url or "/chat/completions" in flow.request.pretty_url:
                self.conversations.append(pair)
                self.generate_html()
        
        elif "/v1/messages" in flow.request.pretty_url or "/chat/completions" in flow.request.pretty_url:
            # Orphaned response - try to match by request-id header
            anthropic_request_id = resp.headers.get('request-id')
            matched = False
            
            if anthropic_request_id:
                # Look for matching request by anthropic request ID in headers
                for req_id, req_info in list(self.pending_requests.items()):
                    if req_info.get('headers', {}).get('anthropic-request-id') == anthropic_request_id:
                        request_info = self.pending_requests.pop(req_id)
                        response_info["anthropic_request_id"] = anthropic_request_id
                        
                        pair = {
                            "timestamp": request_info["timestamp"],
                            "request": request_info,
                            "response": response_info
                        }
                        
                        self.write_log_pair(pair)
                        self.conversations.append(pair)
                        self.generate_html()
                        matched = True
                        break
            
            if not matched:
                # Orphaned response
                response_info["note"] = "ORPHANED_RESPONSE - No matching request found"
                if anthropic_request_id:
                    response_info["anthropic_request_id"] = anthropic_request_id
                self.write_log(response_info)
        else:
            # Non-API response, log immediately
            self.write_log(response_info)
    
    def write_log(self, data):
        """Write data to log file"""
        with open(self.log_file, 'a') as f:
            f.write(json.dumps(data, indent=2) + "\n" + "="*80 + "\n")
    
    def write_log_pair(self, pair):
        """Write request-response pair to log file"""
        with open(self.log_file, 'a') as f:
            f.write("REQUEST-RESPONSE PAIR\n")
            f.write("=" * 50 + "\n")
            f.write("REQUEST:\n")
            f.write(json.dumps(pair["request"], indent=2) + "\n")
            f.write("-" * 50 + "\n")
            f.write("RESPONSE:\n")
            f.write(json.dumps(pair["response"], indent=2) + "\n")
            f.write("=" * 80 + "\n")
    
    def cleanup_orphaned_requests(self):
        """Log any remaining orphaned requests"""
        for req_id, request_info in self.pending_requests.items():
            request_info["note"] = "ORPHANED_REQUEST - No matching response received"
            self.orphaned_requests.append(request_info)
            self.write_log(request_info)
        self.pending_requests.clear()
    
    def extract_model_from_request(self, request_body):
        """Extract model name from request body"""
        if isinstance(request_body, dict):
            return request_body.get('model', 'Unknown')
        return 'Unknown'
    
    def extract_messages_from_request(self, request_body):
        """Extract messages from request body"""
        if isinstance(request_body, dict):
            messages = request_body.get('messages', [])
            return messages
        return []
    
    def extract_system_from_request(self, request_body):
        """Extract system message from request body"""
        if isinstance(request_body, dict):
            system = request_body.get('system')
            # Handle both string and array formats
            if isinstance(system, list):
                return system
            elif isinstance(system, str):
                return [{'type': 'text', 'text': system}]
            elif system:
                return system
        return None
    
    def extract_tools_from_request(self, request_body):
        """Extract tools from request body"""
        if isinstance(request_body, dict):
            return request_body.get('tools', [])
        return []
    
    def extract_metadata_from_request(self, request_body):
        """Extract additional metadata from request body"""
        if not isinstance(request_body, dict):
            return {}
        
        metadata = {}
        
        # Extract common parameters
        if 'max_tokens' in request_body:
            metadata['max_tokens'] = request_body['max_tokens']
        if 'temperature' in request_body:
            metadata['temperature'] = request_body['temperature']
        if 'top_p' in request_body:
            metadata['top_p'] = request_body['top_p']
        if 'top_k' in request_body:
            metadata['top_k'] = request_body['top_k']
        if 'stream' in request_body:
            metadata['stream'] = request_body['stream']
        if 'stop_sequences' in request_body:
            metadata['stop_sequences'] = request_body['stop_sequences']
        if 'metadata' in request_body:
            metadata['request_metadata'] = request_body['metadata']
        
        # Extract tool choice settings
        if 'tool_choice' in request_body:
            metadata['tool_choice'] = request_body['tool_choice']
        
        # Extract additional Anthropic-specific parameters
        if 'anthropic_version' in request_body:
            metadata['anthropic_version'] = request_body['anthropic_version']
        if 'anthropic_beta' in request_body:
            metadata['anthropic_beta'] = request_body['anthropic_beta']
        
        return metadata
    
    def parse_sse_events(self, sse_data):
        """Parse Server-Sent Events format and extract streaming content"""
        events = []
        lines = sse_data.strip().split('\n')
        current_event = {}
        
        for line in lines:
            line = line.strip()
            if not line:
                if current_event:
                    events.append(current_event)
                    current_event = {}
                continue
            
            if line.startswith('event: '):
                current_event['event'] = line[7:]
            elif line.startswith('data: '):
                data_str = line[6:]
                if data_str == '[DONE]':
                    current_event['data'] = '[DONE]'
                else:
                    try:
                        current_event['data'] = json.loads(data_str)
                    except json.JSONDecodeError:
                        current_event['data'] = data_str
        
        # Add final event if exists
        if current_event:
            events.append(current_event)
        
        return events

    def extract_streaming_content(self, events):
        """Extract all content from streaming events with enhanced structure"""
        content_blocks = []
        current_block = None
        message_info = {}
        
        for event in events:
            event_type = event.get('event')
            data = event.get('data', {})
            
            # Ensure data is parsed as JSON if it's a string
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except json.JSONDecodeError:
                    data = {}
            
            if event_type == 'message_start':
                message_info = data.get('message', {})
            
            elif event_type == 'content_block_start':
                content_block = data.get('content_block', {})
                block_type = content_block.get('type')
                index = data.get('index', 0)
                
                current_block = {
                    'type': block_type,
                    'index': index,
                    'content': '',
                    'metadata': {},
                    'full_block_data': content_block  # Store complete block data
                }
                
                if block_type == 'tool_use':
                    current_block['metadata'] = {
                        'id': content_block.get('id'),
                        'name': content_block.get('name'),
                        'input': content_block.get('input', {})
                    }
                elif block_type == 'thinking':
                    current_block['metadata'] = {'thinking': True}
                elif block_type == 'text':
                    current_block['metadata'] = {'text': True}
                elif block_type == 'server_tool_use':
                    current_block['metadata'] = {
                        'id': content_block.get('id'),
                        'name': content_block.get('name'),
                        'input': content_block.get('input', {}),
                        'server_tool': True
                    }
                elif block_type == 'web_search_tool_result':
                    current_block['metadata'] = {
                        'query': content_block.get('query'),
                        'results': content_block.get('results', []),
                        'web_search': True
                    }
                elif block_type == 'redacted_thinking':
                    current_block['metadata'] = {'redacted_thinking': True}
                else:
                    # Handle any unknown block types by preserving all their data
                    current_block['metadata'] = {
                        'unknown_type': True,
                        'original_data': content_block
                    }
            
            elif event_type == 'content_block_delta':
                if current_block:
                    delta = data.get('delta', {})
                    delta_type = delta.get('type')
                    
                    if delta_type == 'text_delta':
                        current_block['content'] += delta.get('text', '')
                    elif delta_type == 'thinking_delta':
                        current_block['content'] += delta.get('thinking', '')
                    elif delta_type == 'input_json_delta':
                        current_block['content'] += delta.get('partial_json', '')
                    elif delta_type == 'citations_delta':
                        citation = delta.get('citation', {})
                        if 'citations' not in current_block['metadata']:
                            current_block['metadata']['citations'] = []
                        current_block['metadata']['citations'].append(citation)
                    elif delta_type == 'signature_delta':
                        current_block['content'] += delta.get('signature', '')
                    # Store all delta data for debugging
                    if 'deltas' not in current_block['metadata']:
                        current_block['metadata']['deltas'] = []
                    current_block['metadata']['deltas'].append(delta)
            
            elif event_type == 'content_block_stop':
                if current_block:
                    content_blocks.append(current_block)
                    current_block = None
            
            elif event_type == 'message_delta':
                delta = data.get('delta', {})
                message_info.update({
                    'stop_reason': delta.get('stop_reason'),
                    'stop_sequence': delta.get('stop_sequence')
                })
                usage = data.get('usage', {})
                message_info['usage'] = usage
            
            elif event_type == 'ping':
                # Store ping events for completeness
                if 'ping_events' not in message_info:
                    message_info['ping_events'] = []
                message_info['ping_events'].append(data)
            
            elif event_type == 'error':
                # Handle error events
                if 'error_events' not in message_info:
                    message_info['error_events'] = []
                message_info['error_events'].append(data)
            
            else:
                # Handle any other unknown event types
                if 'unknown_events' not in message_info:
                    message_info['unknown_events'] = []
                message_info['unknown_events'].append({
                    'event_type': event_type,
                    'data': data
                })
        
        return {
            'message_info': message_info,
            'content_blocks': content_blocks
        }

    def extract_content_from_response(self, response_body):
        """Extract assistant response content"""
        if isinstance(response_body, dict):
            # Anthropic format - return the full structured response
            if 'content' in response_body:
                return response_body['content']
            # OpenAI format
            elif 'choices' in response_body:
                choices = response_body['choices']
                if len(choices) > 0:
                    message = choices[0].get('message', {})
                    return message.get('content', '')
        elif isinstance(response_body, str):
            # Handle SSE streaming format
            if 'event: ' in response_body and 'data: ' in response_body:
                events = self.parse_sse_events(response_body)
                content = self.extract_streaming_content(events)
                if content:
                    return content
        return 'No content found'
    
    def format_message_content(self, content):
        """Format message content for HTML display with enhanced support"""
        if isinstance(content, str):
            # Escape HTML and convert newlines to <br>
            content = html.escape(content)
            content = content.replace('\n', '<br>')
            return content
        elif isinstance(content, list):
            formatted_parts = []
            for part in content:
                if isinstance(part, dict):
                    part_type = part.get('type')
                    
                    if part_type == 'text':
                        text = html.escape(part.get('text', ''))
                        text = text.replace('\n', '<br>')
                        formatted_parts.append(text)
                    
                    elif part_type == 'image':
                        source = part.get('source', {})
                        if source.get('type') == 'base64':
                            media_type = source.get('media_type', 'image/png')
                            data = source.get('data', '')
                            # Truncate very long base64 data for display
                            preview_data = data[:100] + '...' if len(data) > 100 else data
                            formatted_parts.append(f'<div class="attachment-image"><img src="data:{media_type};base64,{data}" style="max-width: 400px; max-height: 300px; border: 1px solid #ddd; margin: 10px 0;" alt="Uploaded image"><br><small>Base64 data: {html.escape(preview_data)}</small></div>')
                        else:
                            formatted_parts.append(f'<div class="attachment-image">🖼️ Image (type: {html.escape(source.get("type", "unknown"))})</div>')
                    
                    elif part_type == 'document':
                        source = part.get('source', {})
                        if source.get('type') == 'base64':
                            media_type = source.get('media_type', 'application/pdf')
                            data = source.get('data', '')
                            size_info = f" ({len(data)} chars)" if data else ""
                            formatted_parts.append(f'<div class="attachment-document">📄 Document ({media_type}){size_info}</div>')
                        else:
                            formatted_parts.append(f'<div class="attachment-document">📄 Document (type: {html.escape(source.get("type", "unknown"))})</div>')
                    
                    elif part_type == 'tool_use':
                        tool_name = part.get('name', 'unknown')
                        tool_id = part.get('id', '')
                        tool_input = part.get('input', {})
                        formatted_tool_use = self.format_tool_use(tool_name, tool_id, tool_input)
                        formatted_parts.append(formatted_tool_use)
                    
                    elif part_type == 'tool_result':
                        tool_id = part.get('tool_use_id', '')
                        is_error = part.get('is_error', False)
                        result_content = part.get('content', '')
                        formatted_tool_result = self.format_tool_result(tool_id, result_content, is_error)
                        formatted_parts.append(formatted_tool_result)
                    
                    elif part_type == 'cache_control':
                        cache_type = part.get('type', 'unknown')
                        formatted_parts.append(f'<div class="cache-control">💾 Cache Control: {html.escape(cache_type)}</div>')
                    
                    elif part_type == 'artifact':
                        artifact_type = part.get('type', 'unknown')
                        identifier = part.get('identifier', '')
                        title = part.get('title', '')
                        content = part.get('content', '')
                        formatted_parts.append(f'<div class="artifact">📋 Artifact: {html.escape(title)} ({html.escape(artifact_type)})<br>ID: {html.escape(identifier)}<br><pre>{html.escape(content[:500])}{"..." if len(content) > 500 else ""}</pre></div>')
                    
                    else:
                        # Handle unknown content types - show complete structure
                        formatted_parts.append(f'<div class="unknown-content"><strong>❓ Unknown content type: {html.escape(part_type)}</strong><br><pre>{html.escape(json.dumps(part, indent=2))}</pre></div>')
                else:
                    # Handle non-dict content in arrays
                    formatted_parts.append(f'<div class="raw-content"><pre>{html.escape(str(part))}</pre></div>')
            return '<br>'.join(formatted_parts)
        elif isinstance(content, dict):
            # Handle dict content directly
            return f'<div class="dict-content"><pre>{html.escape(json.dumps(content, indent=2))}</pre></div>'
        return html.escape(str(content))
    
    def format_tool_definitions(self, tools):
        """Format tool definitions with enhanced structure and collapsible parameters"""
        if not tools:
            return ""
        
        formatted_tools = []
        for i, tool in enumerate(tools):
            tool_name = tool.get('name', 'unknown')
            tool_type = tool.get('type', 'unknown')
            tool_desc = tool.get('description', '')
            tool_input_schema = tool.get('input_schema', {})
            
            # Format the tool parameters
            parameters_html = ""
            if tool_input_schema:
                properties = tool_input_schema.get('properties', {})
                required = tool_input_schema.get('required', [])
                
                if properties:
                    param_list = []
                    for param_name, param_info in properties.items():
                        param_type = param_info.get('type', 'unknown')
                        param_desc = param_info.get('description', '')
                        required_mark = ' <span class="required">*</span>' if param_name in required else ''
                        
                        param_html = f"""
                        <div class="tool-parameter">
                            <strong>{html.escape(param_name)}</strong>{required_mark} <code>({html.escape(param_type)})</code>
                            {f'<br><span class="param-desc">{html.escape(param_desc)}</span>' if param_desc else ''}
                        </div>"""
                        param_list.append(param_html)
                    
                    parameters_html = f"""
                    <div class="tool-parameters">
                        <strong>Parameters:</strong>
                        <div class="parameter-list">{''.join(param_list)}</div>
                    </div>"""
            
            tool_html = f"""
            <div class="tool-definition">
                <div class="tool-header">
                    <strong class="tool-name">{html.escape(tool_name)}</strong>
                    <span class="tool-type">({html.escape(tool_type)})</span>
                    <span class="toggle-params" onclick="toggleSection('params-{i}')">\u25bc</span>
                </div>
                <div class="tool-description">{html.escape(tool_desc)}</div>
                <div class="tool-details collapsible-content" id="params-{i}">
                    {parameters_html}
                </div>
            </div>"""
            formatted_tools.append(tool_html)
        
        return ''.join(formatted_tools)
    
    def format_tool_use(self, tool_name, tool_id, tool_input):
        """Format tool use with enhanced structure and syntax highlighting"""
        # Format the input with better structure
        input_html = ""
        if tool_input:
            if isinstance(tool_input, dict) and len(tool_input) <= 3:
                # Show small inputs inline
                input_parts = []
                for key, value in tool_input.items():
                    value_str = json.dumps(value) if not isinstance(value, str) else f'"{value}"'
                    input_parts.append(f'<span class="input-param"><strong>{html.escape(key)}:</strong> <code>{html.escape(value_str)}</code></span>')
                input_html = '<br>'.join(input_parts)
            else:
                # Show large inputs in collapsible section
                input_json = json.dumps(tool_input, indent=2)
                input_html = f"""
                <span class="toggle-input" onclick="toggleSection('input-{tool_id}')">\u25bc Show Input</span>
                <div class="collapsible-content tool-input-json" id="input-{tool_id}">
                    <pre class="json-input">{html.escape(input_json)}</pre>
                </div>"""
        
        return f"""
        <div class="tool-use enhanced">
            <div class="tool-use-header">
                <strong>\ud83d\udd27 Tool Use: <span class="tool-name">{html.escape(tool_name)}</span></strong>
                <span class="tool-id">ID: {html.escape(tool_id)}</span>
            </div>
            <div class="tool-input-section">{input_html}</div>
        </div>"""
    
    def format_tool_result(self, tool_id, result_content, is_error=False):
        """Format tool result with enhanced structure and content detection"""
        status = 'Error' if is_error else 'Success'
        status_icon = '\u274c' if is_error else '\u2705'
        
        # Smart content formatting based on content type
        if isinstance(result_content, list):
            # Handle nested content in tool results
            result_display = self.format_message_content(result_content)
        elif isinstance(result_content, dict):
            # Pretty format JSON
            result_display = f'<pre class="json-result">{html.escape(json.dumps(result_content, indent=2))}</pre>'
        elif isinstance(result_content, str):
            # Detect content type and format accordingly
            content = result_content.strip()
            
            # Check if it's JSON
            if content.startswith(('{', '[')):
                try:
                    parsed = json.loads(content)
                    result_display = f'<pre class="json-result">{html.escape(json.dumps(parsed, indent=2))}</pre>'
                except json.JSONDecodeError:
                    result_display = f'<pre class="text-result">{html.escape(content)}</pre>'
            # Check if it's HTML
            elif content.startswith('<') and '>' in content:
                result_display = f'<div class="html-result"><strong>HTML Content:</strong><pre class="html-preview">{html.escape(content)}</pre></div>'
            # Check if it's a file path or URL
            elif content.startswith(('/', 'http://', 'https://', 'file://')):
                result_display = f'<div class="path-result"><strong>Path/URL:</strong> <code>{html.escape(content)}</code></div>'
            # Large text content
            elif len(content) > 500:
                preview = content[:500] + '...'
                result_display = f"""
                <div class="large-text-result">
                    <div class="text-preview">{html.escape(preview)}</div>
                    <span class="toggle-full" onclick="toggleSection('full-{tool_id}')">\u25bc Show Full Content</span>
                    <div class="collapsible-content" id="full-{tool_id}">
                        <pre class="full-text">{html.escape(content)}</pre>
                    </div>
                </div>"""
            else:
                result_display = f'<pre class="text-result">{html.escape(content)}</pre>'
        else:
            result_display = f'<pre class="raw-result">{html.escape(str(result_content))}</pre>'
        
        return f"""
        <div class="tool-result enhanced tool-result-{'error' if is_error else 'success'}">
            <div class="tool-result-header">
                <strong>{status_icon} Tool Result: <span class="result-status">{status}</span></strong>
                <span class="tool-id">ID: {html.escape(tool_id)}</span>
            </div>
            <div class="tool-result-content">{result_display}</div>
        </div>"""
    
    def format_server_tool_use(self, tool_name, tool_id, tool_input):
        """Format server tool use with special styling"""
        # Format the input with better structure
        input_html = ""
        if tool_input:
            if isinstance(tool_input, dict) and len(tool_input) <= 3:
                # Show small inputs inline
                input_parts = []
                for key, value in tool_input.items():
                    value_str = json.dumps(value) if not isinstance(value, str) else f'"{value}"'
                    input_parts.append(f'<span class="input-param"><strong>{html.escape(key)}:</strong> <code>{html.escape(value_str)}</code></span>')
                input_html = '<br>'.join(input_parts)
            else:
                # Show large inputs in collapsible section
                input_json = json.dumps(tool_input, indent=2)
                input_html = f"""
                <span class="toggle-input" onclick="toggleSection('input-{tool_id}')">\u25bc Show Input</span>
                <div class="collapsible-content tool-input-json" id="input-{tool_id}">
                    <pre class="json-input">{html.escape(input_json)}</pre>
                </div>"""
        
        return f"""
        <div class="tool-use enhanced server-tool">
            <div class="tool-use-header server-header">
                <strong>\ud83c\udf10 Server Tool: <span class="tool-name">{html.escape(tool_name)}</span></strong>
                <span class="tool-id">ID: {html.escape(tool_id)}</span>
            </div>
            <div class="tool-input-section">{input_html}</div>
        </div>"""
    
    def format_streaming_content(self, streaming_data):
        """Format structured streaming content for HTML display"""
        if not isinstance(streaming_data, dict):
            return self.format_message_content(streaming_data)
        
        formatted_parts = []
        message_info = streaming_data.get('message_info', {})
        content_blocks = streaming_data.get('content_blocks', [])
        
        # Add message metadata if available
        if message_info.get('usage'):
            usage = message_info['usage']
            usage_details = []
            if usage.get('input_tokens'):
                usage_details.append(f"Input={usage['input_tokens']}")
            if usage.get('output_tokens'):
                usage_details.append(f"Output={usage['output_tokens']}")
            if usage.get('cache_creation_input_tokens'):
                usage_details.append(f"Cache Created={usage['cache_creation_input_tokens']}")
            if usage.get('cache_read_input_tokens'):
                usage_details.append(f"Cache Read={usage['cache_read_input_tokens']}")
            if usage.get('server_tool_use'):
                stu = usage['server_tool_use']
                usage_details.append(f"Server Tool: Input={stu.get('input_tokens', 0)}, Output={stu.get('output_tokens', 0)}")
            formatted_parts.append(f'<div class="usage-info">💾 Tokens: {", ".join(usage_details)}</div>')
        
        # Add stop reason if available
        if message_info.get('stop_reason'):
            formatted_parts.append(f'<div class="stop-info">🛑 Stop Reason: {html.escape(message_info["stop_reason"])}</div>')
        
        # Add error events if any
        if message_info.get('error_events'):
            for error_event in message_info['error_events']:
                error_type = error_event.get('type', 'unknown')
                error_message = error_event.get('message', 'No message')
                formatted_parts.append(f'<div class="error-info">❌ Error ({html.escape(error_type)}): {html.escape(error_message)}</div>')
        
        # Add unknown events if any
        if message_info.get('unknown_events'):
            for unknown_event in message_info['unknown_events']:
                event_type = unknown_event.get('event_type', 'unknown')
                formatted_parts.append(f'<div class="unknown-event">⚠️ Unknown Event: {html.escape(event_type)}<br><pre>{html.escape(json.dumps(unknown_event.get("data", {}), indent=2))}</pre></div>')
        
        # Format each content block
        for block in content_blocks:
            block_type = block.get('type')
            content = block.get('content', '')
            metadata = block.get('metadata', {})
            index = block.get('index', 0)
            
            if block_type == 'text':
                formatted_content = html.escape(content).replace('\n', '<br>')
                formatted_parts.append(f'<div class="content-block text-block">{formatted_content}</div>')
            
            elif block_type == 'thinking':
                formatted_content = html.escape(content).replace('\n', '<br>')
                formatted_parts.append(f'<div class="content-block thinking-block"><strong>🤔 Thinking:</strong><br>{formatted_content}</div>')
            
            elif block_type == 'redacted_thinking':
                formatted_parts.append(f'<div class="content-block redacted-thinking-block"><strong>🤔 Thinking (Redacted)</strong></div>')
            
            elif block_type == 'tool_use':
                tool_name = metadata.get('name', 'unknown')
                tool_id = metadata.get('id', '')
                tool_input = metadata.get('input', {})
                server_tool = metadata.get('server_tool', False)
                if server_tool:
                    formatted_tool_use = self.format_server_tool_use(tool_name, tool_id, tool_input)
                else:
                    formatted_tool_use = self.format_tool_use(tool_name, tool_id, tool_input)
                formatted_parts.append(f'<div class="content-block tool-use-block">{formatted_tool_use}</div>')
            
            elif block_type == 'server_tool_use':
                tool_name = metadata.get('name', 'unknown')
                tool_id = metadata.get('id', '')
                tool_input = metadata.get('input', {})
                formatted_server_tool = self.format_server_tool_use(tool_name, tool_id, tool_input)
                formatted_parts.append(f'<div class="content-block server-tool-use-block">{formatted_server_tool}</div>')
            
            elif block_type == 'web_search_tool_result':
                query = metadata.get('query', '')
                results = metadata.get('results', [])
                formatted_parts.append(f'<div class="content-block web-search-block"><strong>🔍 Web Search</strong><br>Query: {html.escape(query)}<br>Results: {len(results)} found</div>')
                for result in results:
                    title = result.get('title', 'Untitled')
                    url = result.get('url', '')
                    snippet = result.get('snippet', '')
                    formatted_parts.append(f'<div class="web-search-result"><strong><a href="{html.escape(url)}" target="_blank">{html.escape(title)}</a></strong><br>{html.escape(snippet)}</div>')
            
            # Handle citations
            if metadata.get('citations'):
                for citation in metadata['citations']:
                    cite_type = citation.get('type', 'unknown')
                    cited_text = citation.get('cited_text', '')
                    doc_title = citation.get('document_title', 'Unknown Document')
                    formatted_parts.append(f'<div class="citation-block">📖 Citation ({cite_type}): "{html.escape(cited_text)}" from {html.escape(doc_title)}</div>')
            
            else:
                formatted_content = html.escape(content).replace('\n', '<br>')
                formatted_parts.append(f'<div class="content-block unknown-block"><strong>{html.escape(block_type.upper())} (Block {index}):</strong><br>{formatted_content}</div>')
        
        return '<br>'.join(formatted_parts)
    
    def generate_html(self):
        """Generate HTML file with conversation data"""
        # Sort conversations by timestamp
        sorted_conversations = sorted(self.conversations, key=lambda x: x['timestamp'])
        
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Code Conversation Log</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
        }}
        .conversation {{
            border-bottom: 1px solid #eee;
            padding: 20px;
        }}
        .conversation:last-child {{
            border-bottom: none;
        }}
        .metadata {{
            background: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-size: 0.9em;
            color: #666;
        }}
        .message {{
            margin: 15px 0;
            padding: 15px;
            border-radius: 8px;
        }}
        .system-message {{
            background: #fff3cd;
            border-left: 4px solid #ffc107;
        }}
        .user-message {{
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
        }}
        .assistant-message {{
            background: #f3e5f5;
            border-left: 4px solid #9c27b0;
        }}
        .message-role {{
            font-weight: bold;
            margin-bottom: 8px;
            color: #333;
        }}
        .message-content {{
            word-wrap: break-word;
        }}
        .no-conversations {{
            text-align: center;
            padding: 40px;
            color: #666;
        }}
        pre {{
            background: #f4f4f4;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 0.9em;
            max-height: 300px;
            overflow-y: auto;
        }}
        .timestamp {{
            font-size: 0.8em;
            color: #888;
        }}
        .content-block {{
            margin: 10px 0;
            padding: 10px;
            border-radius: 4px;
        }}
        .thinking-block {{
            background: #e8f5e8;
            border-left: 3px solid #4caf50;
        }}
        .tool-use-block, .tool-use {{
            background: #fff8e1;
            border-left: 3px solid #ff9800;
        }}
        .tool-result {{
            background: #f3e5f5;
            border-left: 3px solid #9c27b0;
            margin: 5px 0;
        }}
        .tool-result-error {{
            background: #ffebee;
            border-left: 3px solid #f44336;
        }}
        .tool-result-success {{
            background: #e8f5e8;
            border-left: 3px solid #4caf50;
        }}
        .usage-info {{
            background: #e3f2fd;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            margin: 5px 0;
        }}
        .attachment-image, .attachment-document {{
            margin: 10px 0;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
            border: 1px solid #dee2e6;
        }}
        .tools-section {{
            background: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
            border-left: 3px solid #6c757d;
        }}
        .unknown-content, .unknown-block {{
            background: #f8d7da;
            border-left: 3px solid #dc3545;
        }}
        .redacted-thinking-block {{
            background: #fff3cd;
            border-left: 3px solid #ffc107;
            font-style: italic;
        }}
        .server-tool-use-block {{
            background: #e8f5e8;
            border-left: 3px solid #4caf50;
        }}
        .web-search-block {{
            background: #e3f2fd;
            border-left: 3px solid #2196f3;
        }}
        .web-search-result {{
            background: #f8f9fa;
            padding: 8px;
            margin: 5px 0;
            border-radius: 4px;
            border-left: 2px solid #6c757d;
        }}
        .citation-block {{
            background: #f3e5f5;
            border-left: 3px solid #9c27b0;
            padding: 8px;
            margin: 5px 0;
            border-radius: 4px;
            font-size: 0.9em;
        }}
        .stop-info {{
            background: #fff3cd;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            margin: 5px 0;
            border-left: 3px solid #ffc107;
        }}
        .cache-control {{
            background: #d1ecf1;
            border-left: 3px solid #bee5eb;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            margin: 5px 0;
        }}
        .artifact {{
            background: #d1ecf1;
            border-left: 3px solid #bee5eb;
            padding: 10px;
            border-radius: 4px;
            margin: 5px 0;
        }}
        .error-info {{
            background: #ffebee;
            border-left: 3px solid #f44336;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            margin: 5px 0;
        }}
        .unknown-event {{
            background: #fff3e0;
            border-left: 3px solid #ff9800;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            margin: 5px 0;
        }}
        
        /* Enhanced Tool Styling */
        .tool-definition {{
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            margin: 8px 0;
            overflow: hidden;
        }}
        .tool-header {{
            background: #e9ecef;
            padding: 12px;
            border-bottom: 1px solid #dee2e6;
            display: flex;
            align-items: center;
            gap: 10px;
        }}
        .tool-name {{
            color: #495057;
            font-size: 1.1em;
        }}
        .tool-type {{
            background: #6c757d;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8em;
        }}
        .tool-description {{
            padding: 12px;
            color: #6c757d;
            font-style: italic;
        }}
        .tool-details {{
            padding: 12px;
            background: #ffffff;
        }}
        .tool-parameters {{
            margin-top: 8px;
        }}
        .parameter-list {{
            margin-left: 16px;
        }}
        .tool-parameter {{
            margin: 8px 0;
            padding: 8px;
            background: #f8f9fa;
            border-radius: 4px;
            border-left: 3px solid #007bff;
        }}
        .required {{
            color: #dc3545;
            font-weight: bold;
        }}
        .param-desc {{
            color: #6c757d;
            font-size: 0.9em;
            margin-top: 4px;
        }}
        
        /* Enhanced Tool Use Styling */
        .tool-use.enhanced {{
            background: #fff8e1;
            border: 1px solid #ffcc02;
            border-radius: 6px;
            margin: 10px 0;
            overflow: hidden;
        }}
        .tool-use.enhanced.server-tool {{
            background: #e8f5e8;
            border-color: #4caf50;
        }}
        .tool-use-header {{
            background: #ffecb3;
            padding: 12px;
            border-bottom: 1px solid #ffcc02;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .tool-use-header.server-header {{
            background: #c8e6c9;
            border-bottom-color: #4caf50;
        }}
        .tool-id {{
            font-size: 0.8em;
            color: #666;
            font-family: monospace;
        }}
        .tool-input-section {{
            padding: 12px;
        }}
        .input-param {{
            display: block;
            margin: 4px 0;
        }}
        .input-param strong {{
            color: #495057;
        }}
        .input-param code {{
            background: #f8f9fa;
            padding: 2px 6px;
            border-radius: 3px;
            border: 1px solid #dee2e6;
        }}
        .tool-input-json {{
            margin-top: 8px;
        }}
        .json-input {{
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 12px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9em;
        }}
        
        /* Enhanced Tool Result Styling */
        .tool-result.enhanced {{
            border-radius: 6px;
            margin: 10px 0;
            overflow: hidden;
        }}
        .tool-result-header {{
            padding: 12px;
            border-bottom: 1px solid;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .tool-result.enhanced.tool-result-success .tool-result-header {{
            background: #d4edda;
            border-bottom-color: #4caf50;
        }}
        .tool-result.enhanced.tool-result-error .tool-result-header {{
            background: #f8d7da;
            border-bottom-color: #f44336;
        }}
        .result-status {{
            font-weight: bold;
        }}
        .tool-result-content {{
            padding: 12px;
        }}
        .json-result, .text-result, .raw-result {{
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 12px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9em;
            margin: 0;
        }}
        .html-result {{
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 12px;
        }}
        .html-preview {{
            background: #f8f9fa;
            padding: 8px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.8em;
            max-height: 200px;
            overflow-y: auto;
        }}
        .path-result {{
            padding: 8px;
            background: #e3f2fd;
            border-radius: 4px;
            border-left: 3px solid #2196f3;
        }}
        .large-text-result {{
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 12px;
        }}
        .text-preview {{
            background: #f8f9fa;
            padding: 8px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9em;
        }}
        .full-text {{
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 12px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9em;
            margin-top: 8px;
            max-height: 400px;
            overflow-y: auto;
        }}
        
        /* Interactive Elements */
        .toggle-params, .toggle-tools, .toggle-input, .toggle-full {{
            cursor: pointer;
            color: #007bff;
            font-size: 0.9em;
            margin-left: auto;
            user-select: none;
        }}
        .toggle-params:hover, .toggle-tools:hover, .toggle-input:hover, .toggle-full:hover {{
            color: #0056b3;
            text-decoration: underline;
        }}
        .collapsible-content {{
            display: block;
        }}
        .collapsible-content.hidden {{
            display: none;
        }}
        .dict-content, .raw-content {{
            background: #f8f9fa;
            border-left: 3px solid #6c757d;
            padding: 10px;
            margin: 5px 0;
            border-radius: 4px;
        }}
        .current-response {{
            border-left: 6px solid #9c27b0;
        }}
        .assistant-message.current-response {{
            background: #f8f4fd;
        }}
    </style>
    <script>
        function toggleSection(elementId) {{
            const element = document.getElementById(elementId);
            if (element) {{
                element.classList.toggle('hidden');
                // Find the toggle button and update its text
                const toggleButtons = document.querySelectorAll('[onclick="toggleSection(\'' + elementId + '\')"]');
                toggleButtons.forEach(button => {{
                    button.textContent = element.classList.contains('hidden') ? '▶' : '▼';
                }});
            }}
        }}
        
        // Initialize collapsible sections as collapsed by default
        document.addEventListener('DOMContentLoaded', function() {{
            // Collapse tool parameters by default
            const paramSections = document.querySelectorAll('[id^="params-"]');
            paramSections.forEach(section => {{
                section.classList.add('hidden');
            }});
            
            // Collapse tool inputs by default for large inputs
            const inputSections = document.querySelectorAll('[id^="input-"]');
            inputSections.forEach(section => {{
                section.classList.add('hidden');
            }});
            
            // Collapse full text content by default
            const fullTextSections = document.querySelectorAll('[id^="full-"]');
            fullTextSections.forEach(section => {{
                section.classList.add('hidden');
            }});
            
            // Update toggle button text for collapsed sections
            const toggleButtons = document.querySelectorAll('.toggle-params, .toggle-input, .toggle-full');
            toggleButtons.forEach(button => {{
                if (button.textContent === '▼') {{
                    button.textContent = '▶';
                }}
            }});
        }});
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Claude Code Conversation Log</h1>
            <p>Generated at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            <p>Total conversations: {len(sorted_conversations)}</p>
        </div>
        
        <div class="content">
"""
        
        if not sorted_conversations:
            html_content += """
            <div class="no-conversations">
                <h3>No conversations logged yet</h3>
                <p>Start using Claude Code to see conversations appear here.</p>
            </div>
"""
        else:
            for i, conv in enumerate(sorted_conversations, 1):
                request_body = conv['request'].get('body', {})
                response_body = conv['response'].get('body')
                response_body_raw = conv['response'].get('body_raw')
                
                model = self.extract_model_from_request(request_body)
                messages = self.extract_messages_from_request(request_body)
                request_metadata = self.extract_metadata_from_request(request_body)
                
                # Try structured response first, then raw SSE
                if response_body:
                    assistant_response = self.extract_content_from_response(response_body)
                elif response_body_raw:
                    assistant_response = self.extract_content_from_response(response_body_raw)
                else:
                    assistant_response = 'No response content'
                
                html_content += f"""
            <div class="conversation">
                <div class="metadata">
                    <strong>Conversation #{i}</strong> • 
                    <span class="timestamp">{conv['timestamp']}</span> • 
                    <strong>Model:</strong> {html.escape(model)} • 
                    <strong>Status:</strong> {conv['response']['status_code']} •
                    <strong>Request ID:</strong> {conv['response'].get('anthropic_request_id', 'N/A')}
                    {f' • <strong>Max Tokens:</strong> {request_metadata["max_tokens"]}' if request_metadata.get('max_tokens') else ''}
                    {f' • <strong>Temperature:</strong> {request_metadata["temperature"]}' if request_metadata.get('temperature') else ''}
                    {f' • <strong>Streaming:</strong> {"Yes" if request_metadata.get("stream") else "No"}' if 'stream' in request_metadata else ''}
                    {f' • <strong>Tool Choice:</strong> {html.escape(json.dumps(request_metadata["tool_choice"]))}' if request_metadata.get('tool_choice') else ''}
                    {f' • <strong>API Version:</strong> {html.escape(request_metadata["anthropic_version"])}' if request_metadata.get('anthropic_version') else ''}
                    {f' • <strong>Beta:</strong> {html.escape(json.dumps(request_metadata["anthropic_beta"]))}' if request_metadata.get('anthropic_beta') else ''}
                </div>
"""
                
                # Display system message if present
                system_message = self.extract_system_from_request(request_body)
                if system_message:
                    formatted_system = self.format_message_content(system_message)
                    html_content += f"""
                <div class="message system-message">
                    <div class="message-role">⚙️ System Instructions</div>
                    <div class="message-content">{formatted_system}</div>
                </div>
"""
                
                # Display tools if present
                tools = self.extract_tools_from_request(request_body)
                if tools:
                    tools_formatted = self.format_tool_definitions(tools)
                    html_content += f"""
                <div class="message tools-section">
                    <div class="message-role">🔧 Available Tools ({len(tools)}) <span class="toggle-tools" onclick="toggleSection('tools-{i}')">▼</span></div>
                    <div class="message-content collapsible-content" id="tools-{i}">{tools_formatted}</div>
                </div>
"""
                
                # Display conversation messages
                for msg in messages:
                    role = msg.get('role', 'unknown')
                    content = msg.get('content', '')
                    
                    if role == 'user':
                        formatted_content = self.format_message_content(content)
                        html_content += f"""
                <div class="message user-message">
                    <div class="message-role">👤 User</div>
                    <div class="message-content">{formatted_content}</div>
                </div>
"""
                    elif role == 'assistant':
                        formatted_content = self.format_message_content(content)
                        html_content += f"""
                <div class="message assistant-message">
                    <div class="message-role">🤖 Assistant (Previous Turn)</div>
                    <div class="message-content">{formatted_content}</div>
                </div>
"""
                
                # Display current assistant response
                if isinstance(assistant_response, dict) and 'content_blocks' in assistant_response:
                    formatted_response = self.format_streaming_content(assistant_response)
                else:
                    formatted_response = self.format_message_content(assistant_response)
                
                html_content += f"""
                <div class="message assistant-message current-response">
                    <div class="message-role">🤖 Assistant Response ({html.escape(model)})</div>
                    <div class="message-content">{formatted_response}</div>
                </div>
            </div>
"""
        
        html_content += """
        </div>
    </div>
</body>
</html>"""
        
        # Write HTML file
        with open(self.html_file, 'w', encoding='utf-8') as f:
            f.write(html_content)

# Global logger instance
logger = ClaudeTrafficLogger()

def request(flow: http.HTTPFlow) -> None:
    """Called when a request is received"""
    logger.log_request(flow)

def response(flow: http.HTTPFlow) -> None:
    """Called when a response is received"""
    logger.log_response(flow)

def done() -> None:
    """Called when mitmproxy is shutting down"""
    logger.cleanup_orphaned_requests()