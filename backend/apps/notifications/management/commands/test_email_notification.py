from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.core.mail import send_mail


class Command(BaseCommand):
    help = "Send a test WebTavern email using current EMAIL_* settings."

    def add_arguments(self, parser):
        parser.add_argument(
            "--to",
            dest="to_email",
            default="",
            help="Recipient email. If omitted, EMAIL_RECIPIENT_OVERRIDE is used.",
        )

    def handle(self, *args, **options):
        to_email = (options.get("to_email") or getattr(settings, "EMAIL_RECIPIENT_OVERRIDE", "") or "").strip()
        if not to_email:
            raise CommandError("Укажите --to=email@example.com или заполните EMAIL_RECIPIENT_OVERRIDE в .env")

        subject_prefix = getattr(settings, "EMAIL_SUBJECT_PREFIX", "[WebTavern]")
        subject = f"{subject_prefix} Тестовое email-уведомление".strip()
        body = "\n".join([
            "Это тестовое письмо WebTavern.",
            "Если оно пришло на реальную почту, SMTP-настройки указаны правильно.",
            "",
            "Это автоматическое уведомление WebTavern.",
        ])

        sent_count = send_mail(
            subject=subject,
            message=body,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@webtavern.local"),
            recipient_list=[to_email],
            fail_silently=False,
        )
        self.stdout.write(self.style.SUCCESS(f"Отправлено писем: {sent_count}. Получатель: {to_email}"))
