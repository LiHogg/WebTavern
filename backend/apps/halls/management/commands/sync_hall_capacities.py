from django.core.management.base import BaseCommand

from apps.halls.models import Hall


class Command(BaseCommand):
    help = "Пересчитать вместимость залов по активным столам"

    def handle(self, *args, **options):
        halls = Hall.objects.prefetch_related("tables")
        updated = 0
        for hall in halls:
            before = hall.capacity
            after = hall.recalculate_capacity()
            if before != after:
                updated += 1
        self.stdout.write(self.style.SUCCESS(f"Пересчёт завершён. Обновлено залов: {updated}."))
