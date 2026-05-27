import json
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from openai import OpenAI


def _get_client() -> OpenAI:
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI is not set in .env")
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def _sse_data(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _openai_text_stream(user_message: str):
    try:
        stream = _get_client().responses.create(
            model="gpt-4o-mini",
            input=user_message,
            stream=True,
        )
        for event in stream:
            if event.type == "response.output_text.delta" and event.delta:
                yield _sse_data({"delta": event.delta})
    except Exception as exc:
        yield _sse_data({"error": str(exc)})
        return

    yield "data: [DONE]\n\n"


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

    response = StreamingHttpResponse(
        _openai_text_stream(message),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
