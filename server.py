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
        raw_body = self.rfile.read(content_length)

        # Try JSON first (base64 encoded)
        if 'application/json' in content_type:
            try:
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

                print(f"[UPLOAD JSON] Saved: {filepath}, size: {len(img_bytes)}, cert: {cert_index}")
                self._send_success(cert_idx, len(img_bytes))
                return
            except Exception as e:
                print(f"[UPLOAD JSON] Error: {e}")
                self.send_error(400, str(e))
                return

        # Try multipart/form-data
        if 'multipart/form-data' in content_type:
            boundary = None
            for param in content_type.split(';'):
                param = param.strip()
                if param.startswith('boundary='):
                    boundary = param[9:].encode()
                    break

            if not boundary:
                self.send_error(400, 'No boundary found')
                return

            parts = raw_body.split(b'--' + boundary)
            file_data = None
            filename = None
            cert_index = 0

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
                        file_data = body_content
                    elif field_name == 'cert_index':
                        cert_index = int(body_content.decode().strip())

            if not file_data or not filename:
                self.send_error(400, 'No file data found')
                return

            ext = '.jpg'
            for e in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                if e.lower() in filename.lower():
                    ext = '.jpg' if e == '.jpeg' else e
                    break

            cert_idx = cert_index % len(CERT_NAMES)
            new_name = f'{CERT_NAMES[cert_idx]}{ext}'
            filepath = os.path.join(IMAGES_DIR, new_name)

            with open(filepath, 'wb') as f:
                f.write(file_data)

            print(f"[UPLOAD MP] Saved: {filepath}, size: {len(file_data)}, cert: {cert_index}")
            self._send_success(cert_idx, len(file_data))
            return

        self.send_error(400, f'Unsupported Content-Type: {content_type}')

    def _send_success(self, cert_idx, size):
        cert_display = resume_cert_names[cert_idx] if cert_idx < len(resume_cert_names) else f'证书{cert_idx+1}'
        success_html = f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="2;url=/?v={cert_idx}"><title>上传成功</title>
<style>body{{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea,#764ba2)}}.box{{text-align:center;background:#fff;padding:40px 60px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3)}}h1{{color:#1E8449;margin:0 0 12px}}p{{color:#2E3440;font-size:1.125rem;margin:8px 0}}.small{{color:#6B7280;font-size:0.875rem;margin-top:16px}}a{{color:#2D5F8A;text-decoration:none;font-weight:600}}</style>
</head><body>
<div class="box">
<h1>🎉 上传成功！</h1>
<p>{cert_display}</p>
<p class="small">文件大小: {size} 字节</p>
<p class="small">正在返回简历页面...</p>
<p><a href="/">← 点击这里立即返回</a></p>
</div></body></html>'''
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(success_html.encode())

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
