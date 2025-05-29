#!/usr/bin/env python3
"""
Claude Code Traffic Logger
Logs all traffic while allowing interactive use of Claude Code
"""

import json
import time
from mitmproxy import http

class ClaudeTrafficLogger:
    def __init__(self):
        self.log_file = f"claude-traffic-{int(time.time())}.log"
        # Don't print to stdout as it interferes with Claude's TUI
    
    def log_request(self, flow: http.HTTPFlow):
        """Log HTTP request details"""
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
        
        self.write_log(request_info)
    
    def log_response(self, flow: http.HTTPFlow):
        """Log HTTP response details"""
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
            elif "text" in content_type:
                response_info["body_raw"] = resp.content.decode('utf-8', errors='ignore')
        
        self.write_log(response_info)
    
    def write_log(self, data):
        """Write data to log file"""
        with open(self.log_file, 'a') as f:
            f.write(json.dumps(data, indent=2) + "\n" + "="*80 + "\n")

# Global logger instance
logger = ClaudeTrafficLogger()

def request(flow: http.HTTPFlow) -> None:
    """Called when a request is received"""
    logger.log_request(flow)

def response(flow: http.HTTPFlow) -> None:
    """Called when a response is received"""
    logger.log_response(flow)