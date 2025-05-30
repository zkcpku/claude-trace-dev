#!/usr/bin/env python3
"""
Claude Code Traffic Logger - New Version
Simple logger that pairs requests with responses and logs them as JSON
Handles race conditions from parallel requests

Usage:
  python3 claude-logger.py                    # Run as mitmproxy script (default behavior)
  python3 claude-logger.py <jsonl_file>       # Generate HTML from existing JSONL file
"""

import json
import time
import threading
import os
import sys
from datetime import datetime
from mitmproxy import http

def load_template_file(filename):
    """Load a template file from the template directory"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(script_dir, 'template', filename)
    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return f"<!-- Template file {filename} not found -->"

def generate_html_from_pairs(pairs, output_file="claude-traffic.html"):
    """Generate HTML file from pairs data"""
    try:
        # Filter to only include v1/messages pairs
        filtered_pairs = [
            pair for pair in pairs 
            if pair.get('request', {}).get('url', '').find('/v1/messages') != -1
        ]
        
        # Load new frontend files
        script_dir = os.path.dirname(os.path.abspath(__file__))
        frontend_dir = os.path.join(script_dir, 'frontend')
        template_path = os.path.join(frontend_dir, 'src', 'template.html')
        bundle_path = os.path.join(frontend_dir, 'dist', 'index.global.js')
        
        # Check if frontend is built
        if not os.path.exists(bundle_path):
            print(f"Frontend bundle not found at {bundle_path}. Run 'npm run build' in frontend directory first.")
            return
            
        # Read template and bundle files
        with open(template_path, 'r', encoding='utf-8') as f:
            html_template = f.read()
        with open(bundle_path, 'r', encoding='utf-8') as f:
            js_bundle = f.read()
        
        print(f"Template loaded: HTML={len(html_template)} chars, JS bundle={len(js_bundle)} chars")
        
        # Prepare data for injection
        import html
        
        data_json = json.dumps({
            'rawPairs': filtered_pairs,
            'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }, ensure_ascii=True, separators=(',', ':'))
        
        # Use HTML escape to handle any problematic characters
        data_json_escaped = html.escape(data_json, quote=False)
        
        # Replace template placeholders
        html_content = html_template.replace('{{BUNDLE_JS}}', js_bundle)
        html_content = html_content.replace('{{BUNDLE_CSS}}', '')  # CSS is now bundled with JS
        html_content = html_content.replace('{{DATA_JSON}}', data_json_escaped)
        html_content = html_content.replace('{{TITLE}}', f'{len(filtered_pairs)} API Calls')
        
        # Write HTML file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(html_content)
            
    except Exception as e:
        print(f"Error generating HTML: {e}")
        raise

class ClaudeTrafficLogger:
    def __init__(self, clear_log=True):
        # Create .claude-logger directory if it doesn't exist
        self.log_dir = ".claude-logger"
        os.makedirs(self.log_dir, exist_ok=True)
        
        # Generate timestamped filenames
        timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        self.log_file = os.path.join(self.log_dir, f"log-{timestamp}.jsonl")
        self.html_file = os.path.join(self.log_dir, f"log-{timestamp}.html")
        
        self.pending_requests = {}  # Maps flow ID to request data
        self.lock = threading.Lock()  # Thread safety for parallel requests
        self.pairs = []  # Store all pairs for HTML generation
        
        # Only clear log when used as mitmproxy script, not for HTML generation
        if clear_log:
            with open(self.log_file, 'w') as f:
                pass  # Just clear the file
    
    def log_request(self, flow: http.HTTPFlow):
        """Store HTTP request details for pairing with response"""
        req = flow.request
        
        # Only log API requests to Anthropic
        if "/v1/messages" not in req.pretty_url and "/chat/completions" not in req.pretty_url:
            return
        
        # Create request data with timestamp
        request_data = {
            "timestamp": time.time(),
            "method": req.method,
            "url": req.pretty_url,
            "headers": dict(req.headers),
            "body": None
        }
        
        # Parse request body if JSON
        if req.content:
            content_type = req.headers.get("content-type", "").lower()
            if "json" in content_type:
                try:
                    request_data["body"] = json.loads(req.content.decode('utf-8'))
                except:
                    request_data["body_raw"] = req.content.decode('utf-8', errors='ignore')
            else:
                request_data["body_raw"] = req.content.decode('utf-8', errors='ignore')
        
        # Store request with thread safety
        flow_id = id(flow)
        with self.lock:
            self.pending_requests[flow_id] = request_data
            # Store flow ID on the flow object for response matching
            flow.request_id = flow_id
    
    def log_response(self, flow: http.HTTPFlow):
        """Match response with request and log the pair"""
        resp = flow.response
        
        # Only process if we have a matching request
        if not hasattr(flow, 'request_id'):
            return
        
        flow_id = flow.request_id
        
        with self.lock:
            # Get the matching request
            if flow_id not in self.pending_requests:
                return
            
            request_data = self.pending_requests.pop(flow_id)
        
        # Create response data
        response_data = {
            "timestamp": time.time(),
            "status_code": resp.status_code,
            "headers": dict(resp.headers),
            "body": None
        }
        
        # Parse response body
        if resp.content:
            content_type = resp.headers.get("content-type", "").lower()
            if "json" in content_type:
                try:
                    response_data["body"] = json.loads(resp.content.decode('utf-8'))
                except:
                    response_data["body_raw"] = resp.content.decode('utf-8', errors='ignore')
            elif "text" in content_type or "event-stream" in content_type:
                response_data["body_raw"] = resp.content.decode('utf-8', errors='ignore')
        
        # Create the paired request-response object
        pair = {
            "request": request_data,
            "response": response_data,
            "logged_at": datetime.now().isoformat()
        }
        
        # Write the pair to the log file (thread-safe file writing)
        with self.lock:
            with open(self.log_file, 'a') as f:
                f.write(json.dumps(pair) + '\n')
            
            # Add to pairs list for HTML generation
            self.pairs.append(pair)
            
            # Generate HTML after each pair
            self.generate_html()
    
    def cleanup_orphaned_requests(self):
        """Log any remaining orphaned requests on shutdown"""
        with self.lock:
            for flow_id, request_data in self.pending_requests.items():
                orphaned = {
                    "request": request_data,
                    "response": None,
                    "note": "ORPHANED_REQUEST - No matching response received",
                    "logged_at": datetime.now().isoformat()
                }
                with open(self.log_file, 'a') as f:
                    f.write(json.dumps(orphaned) + '\n')
            self.pending_requests.clear()
    
    def generate_html(self):
        """Generate HTML file with all pairs data"""
        generate_html_from_pairs(self.pairs, self.html_file)

# Global logger instance (only created when used by mitmproxy)
logger = None

def request(flow: http.HTTPFlow) -> None:
    """Called when a request is received"""
    global logger
    if logger is None:
        logger = ClaudeTrafficLogger()
    logger.log_request(flow)

def response(flow: http.HTTPFlow) -> None:
    """Called when a response is received"""
    global logger
    if logger is None:
        logger = ClaudeTrafficLogger()
    logger.log_response(flow)

def done() -> None:
    """Called when mitmproxy is shutting down"""
    global logger
    if logger is not None:
        logger.cleanup_orphaned_requests()

def generate_html_from_jsonl(jsonl_file, output_file=None):
    """Generate HTML from an existing JSONL file"""
    if not os.path.exists(jsonl_file):
        print(f"Error: File '{jsonl_file}' not found.")
        sys.exit(1)
    
    # Load all pairs from the JSONL file
    pairs = []
    try:
        with open(jsonl_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if line:
                    try:
                        pair = json.loads(line)
                        pairs.append(pair)
                    except json.JSONDecodeError as e:
                        print(f"Warning: Skipping invalid JSON on line {line_num}: {line[:100]}...")
                        continue
    except Exception as e:
        print(f"Error reading file '{jsonl_file}': {e}")
        sys.exit(1)
    
    if not pairs:
        print(f"No valid data found in '{jsonl_file}'.")
        sys.exit(1)
    
    # Determine output file
    if output_file is None:
        # Generate HTML using timestamped output (original behavior)
        timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        log_dir = ".claude-logger"
        os.makedirs(log_dir, exist_ok=True)
        output_file = os.path.join(log_dir, f"log-{timestamp}.html")
    else:
        # Use provided output file
        output_dir = os.path.dirname(output_file)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
    
    try:
        generate_html_from_pairs(pairs, output_file)
        print(f"Generated HTML report: {output_file}")
        print(f"Processed {len(pairs)} API call pairs from {jsonl_file}")
    except Exception as e:
        print(f"Error generating HTML: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Check if running as standalone script with CLI arguments
    if len(sys.argv) > 1:
        # Running as standalone HTML generator
        jsonl_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        generate_html_from_jsonl(jsonl_file, output_file)
    # If no arguments, this file is being imported by mitmproxy (default behavior)