#!/usr/bin/env python3
import http.server, os, json, base64, urllib.parse

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

resume_cert_names = [
    '人工智能训练师证书（初级）',
    '阿里云Apsara Clouder · VISION人工智能设计（入门）',
    '阿里云Apsara Clouder · RAG应用构建及优化',
    '阿里云Apsara Clouder · 基于百炼平台构建智能体应用',
    '人工智能训练师证书（高级）',
    '阿里云Apsara Clouder · VISION人工智能设计（进阶）',
    '阿里云Apsara Clouder · 基于PAI ArtLab的AIGC设计基础',
    '阿里云Apsara Clouder · 利用大模型提升内容生产能力'
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
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            with open('/workspace/index.html', 'rb') as f:
                self.wfile.write(f.read())
            return
        return super().do_GET()

    def do_POST(self):
        content_type = self.headers.get('Content-Type', '')
        content_length = int(self.headers.get('Content-Length', '0'))

        if content_length > 0:
            raw_body = self.rfile.read(content_length)
        else:
            raw_body = b''
            while True:
                chunk = self.rfile.read(65536)
                if not chunk:
                    break
                raw_body += chunk

        try:
            return self._handle_upload(content_type, raw_body)
        except Exception as e:
            print(f"[UPLOAD] Error: {e}", flush=True)
            self._send_json(400, {'error': str(e)})

    def _handle_upload(self, content_type, raw_body):
        if raw_body and ('{' in raw_body[:100].decode('utf-8', errors='replace')):
            try:
                return self._handle_json(raw_body)
            except Exception as e:
                print(f"[UPLOAD JSON] Parse failed: {e}", flush=True)
                pass

        if 'application/json' in content_type:
            return self._handle_json(raw_body)

        if 'multipart/form-data' in content_type:
            return self._handle_multipart(content_type, raw_body)

        if raw_body:
            try:
                return self._handle_json(raw_body)
            except Exception:
                pass

        self._send_json(400, {'error': f'Unsupported request'})

    def _handle_json(self, raw_body):
        data = json.loads(raw_body.decode('utf-8'))
        cert_index = int(data.get('cert_index', 0))
        filename = data.get('filename', 'image.jpg')
        img_data_b64 = data.get('data', '')

        if img_data_b64.startswith('data:'):
            img_data_b64 = img_data_b64.split(',', 1)[1]

        img_bytes = base64.b64decode(img_data_b64)
        ext = os.path.splitext(filename)[1].lower() or '.jpg'
        if ext == '.jpeg':
            ext = '.jpg'

        cert_idx = cert_index % len(CERT_NAMES)
        new_name = f'{CERT_NAMES[cert_idx]}{ext}'
        filepath = os.path.join(IMAGES_DIR, new_name)

        with open(filepath, 'wb') as f:
            f.write(img_bytes)

        print(f"[UPLOAD JSON] Saved: {filepath}, size: {len(img_bytes)}, cert: {cert_index}", flush=True)
        self._send_json(200, {'success': True, 'cert_index': cert_idx, 'size': len(img_bytes), 'filename': new_name})

    def _handle_multipart(self, content_type, raw_body):
        boundary = None
        for param in content_type.split(';'):
            param = param.strip()
            if param.startswith('boundary='):
                boundary = param[9:].encode()
                break

        if not boundary:
            self._send_json(400, {'error': 'No boundary found'})
            return

        parts = raw_body.split(b'--' + boundary)
        files = []
        current_file = None

        for part in parts:
            stripped = part.strip()
            if not stripped or stripped == b'--':
                continue

            if b'Content-Disposition' in part:
                body_start = part.find(b'\r\n\r\n')
                if body_start == -1:
                    body_start = part.find(b'\n\n')
                    if body_start == -1:
                        continue
                    body_content = part[body_start+2:]
                else:
                    body_content = part[body_start+4:]

                if body_content.endswith(b'\r\n'):
                    body_content = body_content[:-2]

                headers_str = part[:body_start].decode('utf-8', errors='replace')

                field_name = None
                for param in headers_str.split(';'):
                    param = param.strip()
                    if param.startswith('name="'):
                        field_name = param[6:-1]

                if field_name == 'files':
                    filename = None
                    for param in headers_str.split(';'):
                        param = param.strip()
                        if param.startswith('filename="'):
                            filename = param[10:-1]
                    current_file = {'data': body_content, 'filename': filename}
                elif field_name == 'cert_index' and current_file is not None:
                    idx = int(body_content.decode().strip())
                    current_file['cert_index'] = idx
                    files.append(current_file)
                    current_file = None

        if current_file is not None:
            current_file['cert_index'] = 0
            files.append(current_file)

        if not files:
            self._send_json(400, {'error': 'No file data found'})
            return

        saved = []
        for f in files:
            filename = f['filename']
            file_data = f['data']
            cert_index = f['cert_index']

            ext = '.jpg'
            for e in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                if e.lower() in filename.lower():
                    ext = '.jpg' if e == '.jpeg' else e
                    break

            cert_idx = cert_index % len(CERT_NAMES)
            new_name = f'{CERT_NAMES[cert_idx]}{ext}'
            filepath = os.path.join(IMAGES_DIR, new_name)

            with open(filepath, 'wb') as fh:
                fh.write(file_data)

            saved.append({'cert_index': cert_idx, 'size': len(file_data), 'filename': new_name})
            print(f"[UPLOAD MP] Saved: {filepath}, size: {len(file_data)}, cert: {cert_index}", flush=True)

        self._send_json(200, {'success': True, 'files': saved, 'count': len(saved)})

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

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
