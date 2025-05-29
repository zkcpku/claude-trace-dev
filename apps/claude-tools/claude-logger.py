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
        self.log_file = "claude-traffic.log"
        self.html_file = "claude-traffic.html"
        self.conversations = []
        self.pending_requests = {}  # Maps request-id to request data
        self.orphaned_requests = []  # Requests without responses
        # Don't print to stdout as it interferes with Claude's TUI
        
        # Clear previous logs and generate initial empty HTML file
        open(self.log_file, 'w').close()  # Clear log file
        self.generate_html()
    
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
                    
                    elif part_type == 'tool_use':
                        tool_name = part.get('name', 'unknown')
                        tool_id = part.get('id', '')
                        tool_input = part.get('input', {})
                        formatted_tool_use = self.format_tool_use(tool_name, tool_id, tool_input)
                        formatted_parts.append(formatted_tool_use)
                    
                    elif part_type == 'tool_result':
                        tool_use_id = part.get('tool_use_id', '')
                        is_error = part.get('is_error', False)
                        result_content = part.get('content', '')
                        formatted_tool_result = self.format_tool_result(tool_use_id, result_content, is_error)
                        formatted_parts.append(formatted_tool_result)
                    
                    else:
                        # Handle unknown content types
                        formatted_parts.append(f'<div class="unknown-content"><strong>❓ Unknown content type: {html.escape(part_type)}</strong><br><pre>{html.escape(json.dumps(part, indent=2))}</pre></div>')
                else:
                    formatted_parts.append(f'<div class="raw-content"><pre>{html.escape(str(part))}</pre></div>')
            return '<br>'.join(formatted_parts)
        elif isinstance(content, dict):
            return f'<div class="dict-content"><pre>{html.escape(json.dumps(content, indent=2))}</pre></div>'
        return html.escape(str(content))
    
    def format_tool_definitions(self, tools):
        """Format tool definitions"""
        if not tools:
            return ""
        
        formatted_tools = []
        for i, tool in enumerate(tools):
            tool_name = tool.get('name', 'unknown')
            tool_desc = tool.get('description', '')
            
            tool_html = f"""
            <div class="tool-definition">
                <strong>{html.escape(tool_name)}</strong>: {html.escape(tool_desc)}
            </div>"""
            formatted_tools.append(tool_html)
        
        return ''.join(formatted_tools)
    
    def format_tool_use(self, tool_name, tool_id, tool_input):
        """Format tool use"""
        input_json = json.dumps(tool_input, indent=2) if tool_input else ""
        return f"""
        <div class="tool-use">
            <strong>🔧 Tool Use: {html.escape(tool_name)}</strong> (ID: {html.escape(tool_id)})
            <pre>{html.escape(input_json)}</pre>
        </div>"""
    
    def format_tool_result(self, tool_use_id, content, is_error=False):
        """Format tool result"""
        status_icon = "❌" if is_error else "✅"
        status_text = "Error" if is_error else "Result"
        css_class = "tool-result-error" if is_error else "tool-result"
        
        # Format content based on its type
        if isinstance(content, str):
            formatted_content = html.escape(content).replace('\n', '<br>')
        elif isinstance(content, list):
            # Handle array of content blocks (text/image blocks)
            formatted_content = self.format_message_content(content)
        elif isinstance(content, dict):
            formatted_content = f'<pre>{html.escape(json.dumps(content, indent=2))}</pre>'
        else:
            formatted_content = html.escape(str(content))
        
        return f"""
        <div class="{css_class}">
            <strong>{status_icon} Tool {status_text}</strong> (ID: {html.escape(tool_use_id)})
            <div class="tool-result-content">{formatted_content}</div>
        </div>"""
    
    def format_streaming_content(self, streaming_data):
        """Format structured streaming content"""
        if not isinstance(streaming_data, dict):
            return self.format_message_content(streaming_data)
        
        formatted_parts = []
        message_info = streaming_data.get('message_info', {})
        content_blocks = streaming_data.get('content_blocks', [])
        
        # Add usage info if available
        if message_info.get('usage'):
            usage = message_info['usage']
            usage_details = []
            if usage.get('input_tokens'):
                usage_details.append(f"Input={usage['input_tokens']}")
            if usage.get('output_tokens'):
                usage_details.append(f"Output={usage['output_tokens']}")
            formatted_parts.append(f'<div class="usage-info">💾 Tokens: {", ".join(usage_details)}</div>')
        
        # Format each content block
        for block in content_blocks:
            block_type = block.get('type')
            content = block.get('content', '')
            metadata = block.get('metadata', {})
            
            if block_type == 'text':
                formatted_content = html.escape(content).replace('\n', '<br>')
                formatted_parts.append(f'<div class="content-block text-block">{formatted_content}</div>')
            
            elif block_type == 'thinking':
                formatted_content = html.escape(content).replace('\n', '<br>')
                formatted_parts.append(f'<div class="content-block thinking-block"><strong>🤔 Thinking:</strong><br>{formatted_content}</div>')
            
            elif block_type == 'tool_use':
                tool_name = metadata.get('name', 'unknown')
                tool_id = metadata.get('id', '')
                tool_input = metadata.get('input', {})
                formatted_tool_use = self.format_tool_use(tool_name, tool_id, tool_input)
                formatted_parts.append(f'<div class="content-block tool-use-block">{formatted_tool_use}</div>')
            
            else:
                formatted_content = html.escape(content).replace('\n', '<br>')
                formatted_parts.append(f'<div class="content-block unknown-block"><strong>{html.escape(block_type.upper())}:</strong><br>{formatted_content}</div>')
        
        return '<br>'.join(formatted_parts)
    
    def merge_conversations(self, conversations):
        """Merge conversations that are continuations of each other"""
        if not conversations:
            return []
        
        merged = []
        current_merged = None
        
        for conv in conversations:
            request_body = conv['request'].get('body', {})
            messages = self.extract_messages_from_request(request_body)
            
            if current_merged is None:
                # First conversation
                current_merged = {
                    'conversations': [conv],
                    'all_messages': messages,
                    'latest_response': conv['response'],
                    'model': self.extract_model_from_request(request_body),
                    'tools': self.extract_tools_from_request(request_body),
                    'system': self.extract_system_from_request(request_body),
                    'metadata': self.extract_metadata_from_request(request_body),
                    'start_time': conv['timestamp'],
                    'end_time': conv['timestamp']
                }
            else:
                # Check if this conversation is a continuation
                prev_messages = current_merged['all_messages']
                
                # If the new conversation's messages start with the same messages as previous,
                # it's likely a continuation
                is_continuation = False
                if len(messages) > len(prev_messages):
                    # Check if previous messages are a prefix of current messages
                    is_continuation = True
                    for i, prev_msg in enumerate(prev_messages):
                        if i >= len(messages) or messages[i] != prev_msg:
                            is_continuation = False
                            break
                
                if is_continuation:
                    # Merge with current conversation
                    current_merged['conversations'].append(conv)
                    current_merged['all_messages'] = messages  # Use the longer message history
                    current_merged['latest_response'] = conv['response']  # Update to latest response
                    current_merged['end_time'] = conv['timestamp']
                else:
                    # Start a new merged conversation
                    merged.append(current_merged)
                    current_merged = {
                        'conversations': [conv],
                        'all_messages': messages,
                        'latest_response': conv['response'],
                        'model': self.extract_model_from_request(request_body),
                        'tools': self.extract_tools_from_request(request_body),
                        'system': self.extract_system_from_request(request_body),
                        'metadata': self.extract_metadata_from_request(request_body),
                        'start_time': conv['timestamp'],
                        'end_time': conv['timestamp']
                    }
        
        # Add the last merged conversation
        if current_merged is not None:
            merged.append(current_merged)
        
        return merged

    def generate_html(self):
        """Generate HTML file with conversation data"""
        # Sort conversations by timestamp
        sorted_conversations = sorted(self.conversations, key=lambda x: x['timestamp'])
        
        # Create merged conversations
        merged_conversations = self.merge_conversations(sorted_conversations)
        
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
        .view-controls {{
            text-align: center;
            margin: 20px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 6px;
        }}
        .view-toggle {{
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin: 0 5px;
            font-size: 0.9em;
        }}
        .view-toggle:hover {{
            background: #0056b3;
        }}
        .view-toggle.active {{
            background: #28a745;
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
        .tool-use {{
            background: #fff8e1;
            border-left: 3px solid #ff9800;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        }}
        .tool-result {{
            background: #e8f5e8;
            border-left: 3px solid #4caf50;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        }}
        .tool-result-error {{
            background: #ffebee;
            border-left: 3px solid #f44336;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        }}
        .tool-result-content {{
            margin-top: 8px;
        }}
        .thinking-block {{
            background: #e8f5e8;
            border-left: 3px solid #4caf50;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        }}
        .usage-info {{
            background: #e3f2fd;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            margin: 5px 0;
        }}
        .individual-conversations {{
            display: none;
        }}
        .merged-conversations {{
            display: block;
        }}
        pre {{
            background: #f4f4f4;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 0.9em;
        }}
    </style>
    <script>
        function toggleView(viewType) {{
            const mergedView = document.querySelector('.merged-conversations');
            const individualView = document.querySelector('.individual-conversations');
            const mergedBtn = document.getElementById('merged-btn');
            const individualBtn = document.getElementById('individual-btn');
            
            if (viewType === 'merged') {{
                mergedView.style.display = 'block';
                individualView.style.display = 'none';
                mergedBtn.classList.add('active');
                individualBtn.classList.remove('active');
                localStorage.setItem('conversationView', 'merged');
            }} else {{
                mergedView.style.display = 'none';
                individualView.style.display = 'block';
                mergedBtn.classList.remove('active');
                individualBtn.classList.add('active');
                localStorage.setItem('conversationView', 'individual');
            }}
        }}
        
        document.addEventListener('DOMContentLoaded', function() {{
            const savedView = localStorage.getItem('conversationView') || 'merged';
            toggleView(savedView);
        }});
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Claude Code Conversation Log</h1>
            <p>Generated at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            <p>Total API calls: {len(sorted_conversations)} | Merged conversations: {len(merged_conversations)}</p>
        </div>
        
        <div class="view-controls">
            <button id="merged-btn" class="view-toggle active" onclick="toggleView('merged')">Merged Conversations</button>
            <button id="individual-btn" class="view-toggle" onclick="toggleView('individual')">Individual API Calls</button>
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
            # Generate merged conversations view
            html_content += '<div class="merged-conversations">'
            if not merged_conversations:
                html_content += '<div class="no-conversations"><h3>No merged conversations available</h3></div>'
            else:
                html_content += self.generate_merged_conversations_html(merged_conversations)
            html_content += '</div>'
            
            # Generate individual conversations view  
            html_content += '<div class="individual-conversations">'
            html_content += self.generate_individual_conversations_html(sorted_conversations)
            html_content += '</div>'
        
        html_content += """
        </div>
    </div>
</body>
</html>"""
        
        # Write HTML file
        with open(self.html_file, 'w', encoding='utf-8') as f:
            f.write(html_content)

    def generate_merged_conversations_html(self, merged_conversations):
        """Generate HTML for merged conversations"""
        html_parts = []
        
        for i, merged_conv in enumerate(merged_conversations, 1):
            messages = merged_conv['all_messages']
            latest_response = merged_conv['latest_response']
            model = merged_conv['model']
            tools = merged_conv['tools']
            system = merged_conv['system']
            metadata = merged_conv['metadata']
            
            # Extract latest response content
            response_body = latest_response.get('body')
            response_body_raw = latest_response.get('body_raw')
            if response_body:
                assistant_response = self.extract_content_from_response(response_body)
            elif response_body_raw:
                assistant_response = self.extract_content_from_response(response_body_raw)
            else:
                assistant_response = 'No response content'
            
            html_parts.append(f"""
            <div class="conversation">
                <div class="metadata">
                    <strong>Merged Conversation #{i}</strong> • 
                    <span class="timestamp">{merged_conv['start_time']} - {merged_conv['end_time']}</span> • 
                    <strong>Model:</strong> {html.escape(model)} • 
                    <strong>API Calls:</strong> {len(merged_conv['conversations'])}
                </div>
""")
            
            # Display system message if present
            if system:
                formatted_system = self.format_message_content(system)
                html_parts.append(f"""
                <div class="message system-message">
                    <div class="message-role">⚙️ System Instructions</div>
                    <div class="message-content">{formatted_system}</div>
                </div>
""")
            
            # Display tools if present
            if tools:
                tools_formatted = self.format_tool_definitions(tools)
                html_parts.append(f"""
                <div class="message">
                    <div class="message-role">🔧 Available Tools ({len(tools)})</div>
                    <div class="message-content">{tools_formatted}</div>
                </div>
""")
            
            # Display all conversation messages
            for msg in messages:
                role = msg.get('role', 'unknown')
                content = msg.get('content', '')
                
                if role == 'user':
                    formatted_content = self.format_message_content(content)
                    html_parts.append(f"""
                <div class="message user-message">
                    <div class="message-role">👤 User</div>
                    <div class="message-content">{formatted_content}</div>
                </div>
""")
                elif role == 'assistant':
                    formatted_content = self.format_message_content(content)
                    html_parts.append(f"""
                <div class="message assistant-message">
                    <div class="message-role">🤖 Assistant</div>
                    <div class="message-content">{formatted_content}</div>
                </div>
""")
            
            # Display current assistant response
            if isinstance(assistant_response, dict) and 'content_blocks' in assistant_response:
                formatted_response = self.format_streaming_content(assistant_response)
            else:
                formatted_response = self.format_message_content(assistant_response)
            
            html_parts.append(f"""
                <div class="message assistant-message">
                    <div class="message-role">🤖 Assistant (Latest Response)</div>
                    <div class="message-content">{formatted_response}</div>
                </div>
            </div>
""")
        
        return ''.join(html_parts)

    def generate_individual_conversations_html(self, sorted_conversations):
        """Generate HTML for individual conversations"""
        html_parts = []
        
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
            
            html_parts.append(f"""
            <div class="conversation">
                <div class="metadata">
                    <strong>API Call #{i}</strong> • 
                    <span class="timestamp">{conv['timestamp']}</span> • 
                    <strong>Model:</strong> {html.escape(model)} • 
                    <strong>Status:</strong> {conv['response']['status_code']}
                </div>
""")
            
            # Display system message if present
            system_message = self.extract_system_from_request(request_body)
            if system_message:
                formatted_system = self.format_message_content(system_message)
                html_parts.append(f"""
                <div class="message system-message">
                    <div class="message-role">⚙️ System Instructions</div>
                    <div class="message-content">{formatted_system}</div>
                </div>
""")
            
            # Display tools if present
            tools = self.extract_tools_from_request(request_body)
            if tools:
                tools_formatted = self.format_tool_definitions(tools)
                html_parts.append(f"""
                <div class="message">
                    <div class="message-role">🔧 Available Tools ({len(tools)})</div>
                    <div class="message-content">{tools_formatted}</div>
                </div>
""")
            
            # Display conversation messages
            for msg in messages:
                role = msg.get('role', 'unknown')
                content = msg.get('content', '')
                
                if role == 'user':
                    formatted_content = self.format_message_content(content)
                    html_parts.append(f"""
                <div class="message user-message">
                    <div class="message-role">👤 User</div>
                    <div class="message-content">{formatted_content}</div>
                </div>
""")
                elif role == 'assistant':
                    formatted_content = self.format_message_content(content)
                    html_parts.append(f"""
                <div class="message assistant-message">
                    <div class="message-role">🤖 Assistant (Previous Turn)</div>
                    <div class="message-content">{formatted_content}</div>
                </div>
""")
            
            # Display current assistant response
            if isinstance(assistant_response, dict) and 'content_blocks' in assistant_response:
                formatted_response = self.format_streaming_content(assistant_response)
            else:
                formatted_response = self.format_message_content(assistant_response)
            
            html_parts.append(f"""
                <div class="message assistant-message">
                    <div class="message-role">🤖 Assistant Response</div>
                    <div class="message-content">{formatted_response}</div>
                </div>
            </div>
""")
        
        return ''.join(html_parts)

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