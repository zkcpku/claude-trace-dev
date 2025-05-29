#!/usr/bin/env python3
"""
Claude Code Traffic Logger - New Version
Simple logger that pairs requests with responses and logs them as JSON
Handles race conditions from parallel requests
"""

import json
import time
import threading
import os
from datetime import datetime
from mitmproxy import http

class ClaudeTrafficLogger:
    def __init__(self):
        self.log_file = "claude-traffic.jsonl"
        self.html_file = "claude-traffic.html"
        self.pending_requests = {}  # Maps flow ID to request data
        self.lock = threading.Lock()  # Thread safety for parallel requests
        self.pairs = []  # Store all pairs for HTML generation
        
        # Clear previous log
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
    
    def load_template_file(self, filename):
        """Load a template file from the template directory"""
        script_dir = os.path.dirname(os.path.abspath(__file__))
        template_path = os.path.join(script_dir, 'template', filename)
        try:
            with open(template_path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            return f"<!-- Template file {filename} not found -->"
    
    def generate_html(self):
        """Generate HTML file with all pairs data"""
        try:
            # Load template files
            html_template = self.load_template_file('index.html')
            css_content = self.load_template_file('styles.css')
            js_content = self.load_template_file('script.js')
            
            # Prepare data for injection
            data_json = json.dumps({
                'rawPairs': self.pairs
            })
            
            # Replace template placeholders
            html_content = html_template.replace('{{CSS_CONTENT}}', css_content)
            html_content = html_content.replace('{{JS_CONTENT}}', js_content)
            html_content = html_content.replace('{{DATA_JSON}}', data_json)
            html_content = html_content.replace('{{TITLE}}', f'{len(self.pairs)} API Calls')
            html_content = html_content.replace('{{TOTAL_PAIRS}}', str(len(self.pairs)))
            html_content = html_content.replace('{{TOTAL_CONVERSATIONS}}', 'Processing...')
            html_content = html_content.replace('{{TIMESTAMP}}', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            
            # The script.js will handle the actual rendering, so we can leave these empty
            html_content = html_content.replace('{{CONVERSATIONS_CONTENT}}', '')
            html_content = html_content.replace('{{RAW_CONTENT}}', '')
            
            # Write HTML file
            with open(self.html_file, 'w', encoding='utf-8') as f:
                f.write(html_content)
                
        except Exception as e:
            # Don't let HTML generation failures break the logger
            pass

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