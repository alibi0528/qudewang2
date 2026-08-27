#!/usr/bin/env python3
import http.server
import os
import sys
import json
import re

PORT = 8081
IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'images')

CERT_NAMES = [
    'cert1-ait-junior',
    'cert2-clouder-vision', 
    'cert3-clouder-rag',
    'cert4-clouder-bailian',
    'cert5-ait-advanced',
    'cert6-clouder-vision-advanced',
    'cert7-clouder-pai-aigc',
    'cert8-clouder-llm-content'
]

class UploadHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/upload':
            try:
                content_length = int(self.headers['Content-Length'])
                body = self.rfile.read(content_length)
                
                # Simple parsing for base64-encoded files
                try:
                    data = json.loads(body)
                    filename = data.get('filename', 'unknown')
                    file_data = data.get('data', '')
                    idx = int(data.get('index', 0))
                    
                    # Decode base64
                    import base64
                    file_bytes = base64.b64decode(file_data)
                    
                    # Get extension
                    ext = '.jpg'
                    for e in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                        if e.lower() in filename.lower():
                            ext = '.jpg' if e == '.jpeg' else e
                            break
                    
                    new_name = f"{CERT_NAMES[idx]}{ext}"
                    filepath = os.path.join(IMAGES_DIR, new_name)
                    
                    with open(filepath, 'wb') as f:
                        f.write(file_bytes)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': True, 'name': new_name}).encode())
                    return
                except Exception as e:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    os.makedirs(IMAGES_DIR, exist_ok=True)
    print(f'🚀 服务器启动: http://localhost:{PORT}')
    print(f'📸 上传页面: http://localhost:{PORT}/upload.html')
    print('按 Ctrl+C 停止')
    try:
        server = http.server.HTTPServer(('', PORT), UploadHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
        server.server_close()
