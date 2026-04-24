import http.server
import webbrowser
import threading
import os

PORT = 8080
FILE = "index.html"

os.chdir(os.path.dirname(os.path.abspath(__file__)))

handler = http.server.SimpleHTTPRequestHandler
handler.log_message = lambda *args: None  # silence request logs

server = http.server.HTTPServer(("127.0.0.1", PORT), handler)

url = f"http://127.0.0.1:{PORT}/{FILE}"
print(f"Starting server at {url}")
print("Press Ctrl+C to stop.")

threading.Timer(0.5, lambda: webbrowser.open(url)).start()

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
