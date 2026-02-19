# Nginx — Web Server and Reverse Proxy

> Author: terminal-skills

You are an expert in Nginx for serving static files, reverse proxying to application servers, load balancing, TLS termination, and HTTP caching. You write efficient configurations that handle thousands of concurrent connections with minimal resource usage.

## Core Competencies

### Server Blocks
- `server`: virtual host — match requests by `server_name` and `listen` port
- `listen 80`: HTTP, `listen 443 ssl http2`: HTTPS with HTTP/2
- `server_name`: domain matching (exact, wildcard `*.example.com`, regex)
- `root`: document root for static files
- `index`: default files (index.html, index.php)

### Location Blocks
- `location /`: prefix match (most general)
- `location = /health`: exact match (highest priority)
- `location ~* \.(jpg|css|js)$`: regex match (case-insensitive)
- `location ^~ /static/`: prefix match, skip regex evaluation
- Priority: exact (`=`) → prefix with `^~` → regex (`~`/`~*`) → longest prefix

### Reverse Proxy
- `proxy_pass http://backend:3000`: forward requests to upstream
- `proxy_set_header Host $host`: pass original Host header
- `proxy_set_header X-Real-IP $remote_addr`: pass client IP
- `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
- `proxy_set_header X-Forwarded-Proto $scheme`: pass HTTP/HTTPS
- WebSocket: `proxy_set_header Upgrade $http_upgrade`, `proxy_set_header Connection "upgrade"`
- Timeouts: `proxy_connect_timeout`, `proxy_read_timeout`, `proxy_send_timeout`

### Load Balancing
- `upstream backend { server app1:3000; server app2:3000; }`: round-robin (default)
- `least_conn`: route to server with fewest connections
- `ip_hash`: sticky sessions by client IP
- `server app1:3000 weight=3`: weighted distribution
- `server app1:3000 backup`: only used when primary servers are down
- Health checks: `max_fails=3 fail_timeout=30s`

### TLS / SSL
- `ssl_certificate /path/to/cert.pem`: certificate chain
- `ssl_certificate_key /path/to/key.pem`: private key
- `ssl_protocols TLSv1.2 TLSv1.3`: modern protocols only
- `ssl_ciphers`: cipher suite selection
- `ssl_session_cache shared:SSL:10m`: session resumption for performance
- `ssl_stapling on`: OCSP stapling
- Let's Encrypt integration via certbot or ACME

### Caching
- `proxy_cache_path /tmp/cache levels=1:2 keys_zone=app:10m max_size=1g`
- `proxy_cache app`: enable caching for location
- `proxy_cache_valid 200 1h`: cache successful responses for 1 hour
- `proxy_cache_bypass $http_cache_control`: respect client Cache-Control
- `add_header X-Cache-Status $upstream_cache_status`: expose cache hit/miss

### Static File Serving
- `expires 1y`: set far-future Cache-Control for hashed assets
- `gzip on`: compress text-based responses
- `gzip_types text/css application/javascript application/json`
- `try_files $uri $uri/ /index.html`: SPA fallback routing
- `sendfile on`: efficient file transfer (zero-copy)
- `tcp_nopush on`: optimize packet sizes

### Security Headers
- `add_header X-Frame-Options DENY`
- `add_header X-Content-Type-Options nosniff`
- `add_header X-XSS-Protection "1; mode=block"`
- `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains"`
- `add_header Content-Security-Policy "default-src 'self'"`
- Rate limiting: `limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s`

### Performance Tuning
- `worker_processes auto`: one worker per CPU core
- `worker_connections 1024`: connections per worker
- `keepalive_timeout 65`: reuse connections
- `client_max_body_size 10m`: upload size limit
- `access_log off`: disable access log for high-traffic static assets

## Code Standards
- Use `server_name` with specific domains — avoid `_` catch-all in production (security risk)
- Always redirect HTTP to HTTPS: `return 301 https://$host$request_uri` in port 80 server block
- Set security headers on every server block — use an `include /etc/nginx/snippets/security.conf` pattern
- Use `try_files` for SPA routing instead of `rewrite` — it's faster and more explicit
- Rate-limit API endpoints: `limit_req zone=api burst=20 nodelay` prevents abuse without affecting normal traffic
- Cache static assets aggressively: `expires 1y` for hashed filenames, `expires 1h` for HTML
- Test config before reload: `nginx -t && nginx -s reload` — a syntax error in config takes down the server
