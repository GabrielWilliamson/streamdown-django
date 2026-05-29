from django.middleware.gzip import GZipMiddleware

class SkipGZipSSEMiddleware(GZipMiddleware):
    """
    Middleware that extends GZipMiddleware to skip compression for Server-Sent Events (SSE).
    SSE responses (text/event-stream) should not be compressed as it can cause buffering issues.
    """
    def process_response(self, request, response):
        if response.has_header('Content-Type') and response['Content-Type'].startswith('text/event-stream'):
            return response
        return super().process_response(request, response)
