#!/usr/bin/env python3
"""
Automatic Claude CLI Token Extractor
Automatically starts mitmproxy, runs Claude CLI, extracts token, and cleans up.
"""

import json
import time
import subprocess
import os
import signal
import tempfile
import threading
import sys
from datetime import datetime

class AutoTokenExtractor:
    def __init__(self):
        self.mitm_process = None
        self.claude_process = None
        self.token_found = False
        self.extracted_token = None
        self.log_file = f"claude-traffic-{int(time.time())}.log"

    def create_mitm_script(self):
        """Create the mitmproxy script for token extraction."""
        script_content = '''
import json
import time
from mitmproxy import http

class TokenExtractor:
    def __init__(self):
        self.log_file = "''' + self.log_file + '''"
        self.token_extracted = False

    def log_request(self, flow: http.HTTPFlow):
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

        # Check for Authorization header
        auth_header = req.headers.get("authorization", "")
        if auth_header and auth_header.startswith("Bearer ") and not self.token_extracted:
            token = auth_header.replace("Bearer ", "")
            print(f"TOKEN_EXTRACTED:{token}", flush=True)
            self.token_extracted = True
            import os
            os._exit(0)

    def log_response(self, flow: http.HTTPFlow):
        resp = flow.response

        response_info = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "type": "RESPONSE",
            "status_code": resp.status_code,
            "headers": dict(resp.headers),
            "content_length": len(resp.content) if resp.content else 0
        }

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
        with open(self.log_file, 'a') as f:
            f.write(json.dumps(data, indent=2) + "\\n" + "="*80 + "\\n")

extractor = TokenExtractor()

def request(flow: http.HTTPFlow) -> None:
    extractor.log_request(flow)

def response(flow: http.HTTPFlow) -> None:
    extractor.log_response(flow)
'''

        # Write script to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(script_content)
            return f.name

    def start_mitmproxy(self, script_path):
        """Start mitmproxy with the token extraction script."""
        print("🚀 Starting mitmproxy...")
        try:
            self.mitm_process = subprocess.Popen([
                'mitmdump',
                '-s', script_path,
                '-p', '8080',
                '--set', 'confdir=~/.mitmproxy',
                '--quiet'
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

            # Give mitmproxy time to start
            time.sleep(3)
            return True
        except Exception as e:
            print(f"Failed to start mitmproxy: {e}")
            return False

    def run_claude(self, message="hello"):
        """Run Claude CLI through the proxy."""
        print("🎯 Running Claude CLI...")

        env = os.environ.copy()
        env.update({
            'HTTP_PROXY': 'http://localhost:8080',
            'HTTPS_PROXY': 'http://localhost:8080',
            'NODE_TLS_REJECT_UNAUTHORIZED': '0'
        })

        try:
            self.claude_process = subprocess.Popen([
                'claude', '-p', message
            ], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            return True
        except Exception as e:
            print(f"Failed to start Claude CLI: {e}")
            return False

    def monitor_output(self):
        """Monitor mitmproxy output for token extraction."""
        if not self.mitm_process:
            return

        print("🔍 Monitoring for token...")
        start_time = time.time()
        timeout = 30

        while time.time() - start_time < timeout and not self.token_found:
            if self.mitm_process.poll() is not None:
                # Process exited, check output
                try:
                    stdout, stderr = self.mitm_process.communicate(timeout=1)
                    for line in stdout.split('\n'):
                        if line.startswith("TOKEN_EXTRACTED:"):
                            self.extracted_token = line.split(":", 1)[1]
                            self.token_found = True
                            break
                except:
                    pass
                break
            time.sleep(0.5)

    def cleanup(self):
        """Clean up all processes."""
        print("🧹 Cleaning up...")

        for process in [self.claude_process, self.mitm_process]:
            if process:
                try:
                    process.terminate()
                    process.wait(timeout=2)
                except:
                    try:
                        process.kill()
                    except:
                        pass

    def extract_token(self, message="hello"):
        """Main extraction method."""
        script_path = None
        try:
            print("🔧 Setting up automatic Claude CLI token extraction...")

            # Clear previous log
            if os.path.exists(self.log_file):
                os.remove(self.log_file)

            # Create mitmproxy script
            script_path = self.create_mitm_script()

            # Start mitmproxy
            if not self.start_mitmproxy(script_path):
                return False

            # Start Claude CLI
            if not self.run_claude(message):
                return False

            # Monitor for token
            self.monitor_output()

            if self.token_found:
                print(f"\n🎉 SUCCESS: Claude CLI OAuth token extracted!")
                print(f"Token: {self.extracted_token}\n")
                print(f"📝 Traffic logged to: {self.log_file}")
                return True
            else:
                print("❌ Timeout: No token found within 30 seconds")
                return False

        except KeyboardInterrupt:
            print("\n⚠️  Interrupted by user")
            return False
        except Exception as e:
            print(f"❌ Error: {e}")
            return False
        finally:
            self.cleanup()
            if script_path:
                try:
                    os.unlink(script_path)
                except:
                    pass

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Automatically extract Claude CLI OAuth token')
    parser.add_argument('--message', '-m', default='hello',
                       help='Message to send to Claude (default: "hello")')

    args = parser.parse_args()

    # Check dependencies
    try:
        subprocess.run(['mitmdump', '--version'], check=True, capture_output=True)
    except:
        print("❌ Error: mitmdump command not found. Please install mitmproxy first.")
        return 1

    try:
        subprocess.run(['claude', '--help'], check=True, capture_output=True)
    except:
        print("❌ Error: claude command not found. Please install Claude CLI first.")
        return 1

    extractor = AutoTokenExtractor()
    success = extractor.extract_token(args.message)

    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())