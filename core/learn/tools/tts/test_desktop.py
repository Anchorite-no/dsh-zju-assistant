import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import engine
import serve
from desktop_host import DesktopHandler


class DesktopHostTest(unittest.TestCase):
    def test_private_reader_and_audio_ranges_without_loading_model(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(serve, 'FILM_DIR', folder), patch.object(engine, 'CACHE_DIR', folder):
            token = 'a' * 64
            class Handler(DesktopHandler):
                pass
            Handler.token = token
            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            origin = f'http://127.0.0.1:{server.server_port}'
            with open(os.path.join(folder, 'a.html'), 'w') as f:
                f.write('<html>fixture</html>')
            with open(os.path.join(folder, '0123456789abcdef.mp3'), 'wb') as f:
                f.write(bytes(range(200)))
            def request(route, data=None, headers=None):
                return urllib.request.urlopen(urllib.request.Request(origin + route, data=data, headers=headers or {}), timeout=3)
            try:
                with self.assertRaises(urllib.error.HTTPError) as error:
                    request('/films')
                self.assertEqual(error.exception.code, 401)
                headers = {'X-Campus-Tts': token, 'Content-Type': 'application/json'}
                with request('/campus/open', json.dumps({'name': 'a.html'}).encode(), headers) as response:
                    self.assertEqual(response.status, 200)
                with request('/opened', headers=headers) as response:
                    self.assertEqual(response.read(), b'<html>fixture</html>')
                    self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
                with self.assertRaises(urllib.error.HTTPError) as error:
                    request('/campus/open', b'{"name":"../secret.html"}', headers)
                self.assertEqual(error.exception.code, 400)
                with request('/audio/0123456789abcdef.mp3', headers={**headers, 'Range': 'bytes=10-19'}) as response:
                    self.assertEqual((response.status, response.read()), (206, bytes(range(10, 20))))
                # Browser exchange must redirect to a URL without the private token.
                opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
                with opener.open(origin + '/?token=' + token) as response:
                    self.assertEqual(response.geturl(), origin + '/')
                    self.assertIn(b'<!DOCTYPE HTML>', response.read()[:100].upper())
            finally:
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == '__main__':
    unittest.main()
