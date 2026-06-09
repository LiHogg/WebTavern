from django.conf import settings


def webtavern_maps(request):
    provider = getattr(settings, "MAPS_PROVIDER", "yandex") or "yandex"
    provider = str(provider).strip().lower()
    if provider not in {"yandex", "google", "local"}:
        provider = "yandex"
    return {
        "webtavern_maps_config": {
            "provider": provider,
            "yandexApiKey": getattr(settings, "YANDEX_MAPS_API_KEY", "") or "",
            "googleApiKey": getattr(settings, "GOOGLE_MAPS_API_KEY", "") or "",
            "googleMapId": getattr(settings, "GOOGLE_MAPS_MAP_ID", "") or "",
            "fallback": "local",
        }
    }
