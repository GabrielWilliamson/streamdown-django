import json
from collections.abc import Iterator
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from google import genai


_CLIENT = None

def _get_client() -> genai.Client:
    global _CLIENT
    if _CLIENT is None:
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not set in .env")
        _CLIENT = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _CLIENT


def _sse_data(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def generate_completion(user_prompt: str):
    """
    Returns the generator function that streams SSE chunks from Gemini.
    """

    def complete_with_gemini() -> Iterator[str]:
        yield ": connected\n\n"

        try:
            client = _get_client()
            stream = client.models.generate_content_stream(
                model="gemini-2.0-flash",
                contents=user_prompt,
            )
            for chunk in stream:
                text = chunk.text
                if text:
                    yield _sse_data({"delta": text})
        except Exception as exc:
            yield _sse_data({"error": str(exc)})
            return

        yield "data: [DONE]\n\n"

    return complete_with_gemini


@csrf_exempt
@require_POST
def chat_stream(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    message = (body.get("message") or "").strip()
    if not message:
        return JsonResponse({"error": "Message is required"}, status=400)

    completion_func = generate_completion(message)
    response = StreamingHttpResponse(
        completion_func(),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


def _spa_index_path() -> Path:
    collected = settings.STATIC_ROOT / "frontend" / "index.html"
    if collected.is_file():
        return collected
    return settings.BASE_DIR / "static" / "frontend" / "index.html"


def spa_index(request):
    index_path = _spa_index_path()
    if not index_path.is_file():
        return JsonResponse(
            {"error": "Frontend not built. Run: cd frontent && pnpm build"},
            status=503,
        )
    return FileResponse(index_path.open("rb"), content_type="text/html")
