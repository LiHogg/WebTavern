from pathlib import Path
import importlib.util
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / "backend" / ".env")


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"

ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host.strip()]

OPTIONAL_INSTALLED_APPS = [
    app_name
    for app_name in ["daphne"]
    if importlib.util.find_spec(app_name)
]

INSTALLED_APPS = OPTIONAL_INSTALLED_APPS + [
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "apps.common",
    "apps.users",
    "apps.organizations",
    "apps.venues",
    "apps.halls",
    "apps.tables",
    "apps.layouts",
    "apps.booking_rules",
    "apps.bookings",
    "apps.waitlist",
    "apps.payments",
    "apps.refunds",
    "apps.notifications",
    "apps.reviews",
    "apps.loyalty",
    "apps.analytics",
    "apps.moderation",
    "apps.audit_logs",
    "apps.media_library",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "apps.common.context_processors.webtavern_maps",
            ],
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "webtavern"),
        "USER": os.getenv("POSTGRES_USER", "webtavern"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "webtavern"),
        "HOST": os.getenv("POSTGRES_HOST", "postgres"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    }
}

AUTH_USER_MODEL = "users.User"

LANGUAGE_CODE = "ru"
LANGUAGES = [
    ("ru", "Russian"),
    ("en", "English"),
    ("zh-hans", "Chinese"),
    ("ja", "Japanese"),
]
TIME_ZONE = "Europe/Berlin"
USE_I18N = True
USE_TZ = True

LOCALE_PATHS = [BASE_DIR / "locale"]

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
}

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "DJANGO_CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080,http://127.0.0.1:8080",
    ).split(",")
    if origin.strip()
]

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "DJANGO_CSRF_TRUSTED_ORIGINS",
        "http://localhost:8080,http://127.0.0.1:8080,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
for origin in CORS_ALLOWED_ORIGINS:
    if origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(origin)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL

EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "smtp").strip().lower()
_raw_email_backend = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_FORCE_IPV4 = os.getenv("EMAIL_FORCE_IPV4", "true").lower() in {"1", "true", "yes", "on"}
if EMAIL_FORCE_IPV4 and _raw_email_backend == "django.core.mail.backends.smtp.EmailBackend":
    EMAIL_BACKEND = "apps.notifications.email_backends.IPv4SMTPEmailBackend"
else:
    EMAIL_BACKEND = _raw_email_backend
EMAIL_HOST = os.getenv("EMAIL_HOST", "mailhog")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "1025"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "false").lower() == "true"
EMAIL_USE_SSL = os.getenv("EMAIL_USE_SSL", "false").lower() == "true"
EMAIL_TIMEOUT = int(os.getenv("EMAIL_TIMEOUT_SECONDS", os.getenv("EMAIL_TIMEOUT", "10")) or 10)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@example.com")
SERVER_EMAIL = os.getenv("SERVER_EMAIL", DEFAULT_FROM_EMAIL)
EMAIL_SUBJECT_PREFIX = os.getenv("EMAIL_SUBJECT_PREFIX", "[WebTavern]")
ENABLE_EMAIL_NOTIFICATIONS = os.getenv("ENABLE_EMAIL_NOTIFICATIONS", "true").lower() == "true"
# HTTP API email delivery. EMAIL_PROVIDER=http uses this endpoint instead of SMTP.
EMAIL_HTTP_API_URL = os.getenv("EMAIL_HTTP_API_URL", "").strip()
EMAIL_HTTP_API_TOKEN = os.getenv("EMAIL_HTTP_API_TOKEN", "").strip()
EMAIL_HTTP_API_AUTH_HEADER = os.getenv("EMAIL_HTTP_API_AUTH_HEADER", "Authorization").strip()
EMAIL_HTTP_API_TOKEN_PREFIX = os.getenv("EMAIL_HTTP_API_TOKEN_PREFIX", "Bearer").strip()
EMAIL_HTTP_TIMEOUT_SECONDS = int(os.getenv("EMAIL_HTTP_TIMEOUT_SECONDS", os.getenv("EMAIL_TIMEOUT_SECONDS", "10")) or 10)
# When this value is set, every outgoing email notification is sent to this mailbox.
# It is useful for local/demo testing with real SMTP credentials.
EMAIL_RECIPIENT_OVERRIDE = os.getenv("EMAIL_RECIPIENT_OVERRIDE", "").strip()
EMAIL_ADD_OVERRIDE_NOTE = os.getenv("EMAIL_ADD_OVERRIDE_NOTE", "true").lower() == "true"

ENABLE_SMS_NOTIFICATIONS = os.getenv("ENABLE_SMS_NOTIFICATIONS", "true").lower() == "true"
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "console").strip().lower()
SMS_FROM = os.getenv("SMS_FROM", "WebTavern")
SMSRU_API_ID = os.getenv("SMSRU_API_ID", os.getenv("SMS_RU_API_ID", ""))
SMS_RU_API_ID = SMSRU_API_ID
SMS_RU_USE_SENDER = os.getenv("SMS_RU_USE_SENDER", "false").lower() in {"1", "true", "yes", "on"}
SMS_MAX_LENGTH = int(os.getenv("SMS_MAX_LENGTH", "120") or 120)
SMS_WEBHOOK_URL = os.getenv("SMS_WEBHOOK_URL", "")
SMS_TIMEOUT_SECONDS = int(os.getenv("SMS_TIMEOUT_SECONDS", "10"))
PUBLIC_SITE_URL = os.getenv("PUBLIC_SITE_URL", "http://localhost:8080")

PAYMENT_PROVIDER = os.getenv("PAYMENT_PROVIDER", "yookassa")
YOOKASSA_SHOP_ID = os.getenv("YOOKASSA_SHOP_ID", "")
YOOKASSA_SECRET_KEY = os.getenv("YOOKASSA_SECRET_KEY", "")
YOOKASSA_RETURN_URL = os.getenv("YOOKASSA_RETURN_URL", "http://localhost:3000/account/payments")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}


MAPS_PROVIDER = os.getenv("MAPS_PROVIDER", "yandex").strip().lower()
YANDEX_MAPS_API_KEY = os.getenv("YANDEX_MAPS_API_KEY", "").strip()
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
GOOGLE_MAPS_MAP_ID = os.getenv("GOOGLE_MAPS_MAP_ID", "").strip()
