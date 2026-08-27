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
                content_length = int(self.headers.get('Content-Length', '0'))
                raw_body = self.rfile.read(content_length)
                
                print(f"[DEBUG] Content-Type: {content_type}")
                print(f"[DEBUG] Content-Length: {content_length}")
                
                if 'multipart/form-data' in content_type:
                    # Extract boundary
                    boundary = None
                    for param in content_type.split(';'):
                        param = param.strip()
                        if param.startswith('boundary='):
                            boundary = param[9:].encode()
                            break
                    
                    if not boundary:
                        raise Exception("No boundary found in multipart request")
                    
                    print(f"[DEBUG] Boundary: {boundary}")
                    
                    # Parse parts
                    # The format is: --boundary\r\nContent-Disposition: form-data; name="..."; filename="..."\r\n\r\n<body>\r\n--boundary
                    parts = raw_body.split(b'--' + boundary)
                    print(f"[DEBUG] Parts found: {len(parts)}")
                    
                    file_data = None
                    filename = 'unknown'
                    idx = 0
                    
                    for i, part in enumerate(parts):
                        # Skip empty parts and end marker
                        stripped = part.strip()
                        if not stripped or stripped == b'--':
                            continue
                        
                        print(f"[DEBUG] Part {i}: {len(part)} bytes, starts with: {part[:100]}")
                        
                        if b'Content-Disposition' in part:
                            # Find the body - it's after \r\n\r\n
                            body_start = part.find(b'\r\n\r\n')
                            if body_start == -1:
                                # Try just \n\n
                                body_start = part.find(b'\n\n')
                                if body_start == -1:
                                    print(f"[DEBUG] Cannot find body in part {i}")
                                    continue
                                body_content = part[body_start+2:]
                            else:
                                body_content = part[body_start+4:]
                            
                            # Remove trailing \r\n (part of multipart format)
                            if body_content.endswith(b'\r\n'):
                                body_content = body_content[:-2]
                            
                            # Parse headers
                            header_section = part[:body_start] if body_start >= 0 else part
                            headers_str = header_section.decode('utf-8', errors='replace')
                            print(f"[DEBUG] Headers part {i}: {headers_str[:200]}")
                            
                            # Find field name
                            field_name = None
                            for param in headers_str.split(';'):
                                param = param.strip()
                                if param.startswith('name="'):
                                    field_name = param[6:-1]
                            
                            print(f"[DEBUG] Part {i} field: {field_name}")
                            
                            if field_name == 'file':
                                # Find filename
                                for param in headers_str.split(';'):
                                    param = param.strip()
                                    if param.startswith('filename="'):
                                        filename = param[10:-1]
                                
                                file_data = body_content
                                print(f"[DEBUG] File found: {filename}, size: {len(file_data)}")
                            elif field_name == 'index':
                                idx = int(body_content.decode().strip())
                                print(f"[DEBUG] Index: {idx}")
                    
                    if file_data is None:
                        raise Exception("No file data found in multipart request")
                    
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
                    
                    print(f"[DEBUG] Saved: {filepath}, size: {len(file_data)}")
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({'ok': True, 'name': new_name, 'size': len(file_data)}).encode())
                    return
                    
            except Exception as e:
                import traceback
                err_msg = traceback.format_exc()
                print(f"[ERROR] {err_msg}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode())
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
