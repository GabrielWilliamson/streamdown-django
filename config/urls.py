from django.urls import include, path, re_path

from chat.views import spa_index

urlpatterns = [
    path("api/", include("chat.urls")),
    path("", spa_index, name="spa-index"),
    re_path(r"^(?!api/|static/).*$", spa_index),
]
