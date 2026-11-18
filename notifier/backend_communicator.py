import urllib
import urllib.request
import os
from urllib.parse import urlparse, ParseResult

URL = ParseResult
class InvalidConfiguration(Exception): pass

def uri_validator(uri: str):
    try:
        result = urlparse(uri)
        return all([result.scheme, result.netloc])
    except AttributeError:
        return False

class BackendCommunication:
    NETLOC_BASE: str = "http://localhost"
    NETLOC_PORT: str = os.getenv("BACKEND_PORT", "")
    BASE_URL: str

    def __init__(self):
        try:
            port = int(BackendCommunication.NETLOC_PORT)
        except ValueError:
            raise InvalidConfiguration("Backend Port not found")
        self.BASE_URL = self.NETLOC_BASE + self.NETLOC_PORT



backend = BackendCommunication()