#!/usr/bin/env python3
import http.server, os, json

PORT = 8080
IMAGES_DIR = '/workspace/images'
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

MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
}

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/upload':
            try:
                content_type = self.headers.get('Content-Type', '')
                
                if 'multipart/form-data' in content_type:
                    # Parse multipart form data
                    cgi_env = {
                        'REQUEST_METHOD': 'POST',
                        'CONTENT_TYPE': content_type,
                        'CONTENT_LENGTH': self.headers.get('Content-Length', '0'),
                    }
                    
                    # Read the raw body
                    content_length = int(self.headers.get('Content-Length', '0'))
                    raw_body = self.rfile.read(content_length)
                    
                    # Extract boundary
                    boundary = None
                    for param in content_type.split(';'):
                        param = param.strip()
                        if param.startswith('boundary='):
                            boundary = param[9:].encode()
                            break
                    
                    if boundary:
                        # Parse the multipart data manually
                        parts = raw_body.split(b'--' + boundary)
                        file_data = None
                        filename = 'unknown'
                        idx = 0
                        
                        for part in parts:
                            if not part or part in [b'--', b'--\r\n', b'--\r\n']:
                                continue
                            
                            # Parse headers
                            if b'Content-Disposition' in part:
                                # Split headers from body
                                sections = part.split(b'\r\n\r\n', 1)
                                if len(sections) < 2:
                                    continue
                                
                                headers = sections[0].decode('utf-8', errors='replace')
                                body = sections[1]
                                # Remove trailing \r\n that's part of multipart format
                                if body.endswith(b'\r\n'):
                                    body = body[:-2]
                                
                                # Find field name
                                name_match = None
                                for param in headers.split(';'):
                                    param = param.strip()
                                    if param.startswith('name="'):
                                        name_match = param[6:-1]
                                
                                if name_match == 'file':
                                    # Find filename
                                    filename = 'unknown'
                                    for param in headers.split(';'):
                                        param = param.strip()
                                        if param.startswith('filename="'):
                                            filename = param[10:-1]
                                    
                                    file_data = body
                                elif name_match == 'index':
                                    idx = int(body.decode().strip())
                        
                        if file_data:
                            # Determine extension
                            ext = '.jpg'
                            for e in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                                if e.lower() in filename.lower():
                                    ext = '.jpg' if e == '.jpeg' else e
                                    break
                            
                            new_name = f'{CERT_NAMES[idx]}{ext}'
                            filepath = os.path.join(IMAGES_DIR, new_name)
                            
                            with open(filepath, 'wb') as f:
                                f.write(file_data)
                            
                            self.send_response(200)
                            self.send_header('Content-Type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(json.dumps({'ok': True, 'name': new_name}).encode())
                            return
                
                # Fallback: JSON with base64
                length = int(self.headers.get('Content-Length', '0'))
                body = self.rfile.read(length)
                import base64
                data = json.loads(body)
                idx = int(data.get('index', 0))
                ext = '.jpg'
                for e in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                    if e.lower() in data.get('filename', '').lower():
                        ext = '.jpg' if e == '.jpeg' else e
                        break
                new_name = f'{CERT_NAMES[idx]}{ext}'
                filepath = os.path.join(IMAGES_DIR, new_name)
                with open(filepath, 'wb') as f:
                    f.write(base64.b64decode(data['data']))
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'name': new_name}).encode())
            except Exception as e:
                import traceback
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': str(e), 'trace': traceback.format_exc()}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        return MIME_TYPES.get(ext, 'application/octet-stream')

os.makedirs(IMAGES_DIR, exist_ok=True)
server = http.server.HTTPServer(('', PORT), Handler)
print(f'Server running at http://localhost:{PORT}', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
