from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from apps.halls.models import Hall

from .models import Table


@receiver(pre_save, sender=Table)
def store_previous_hall(sender, instance, **kwargs):
    if not instance.pk:
        instance._previous_hall_id = None
        return
    instance._previous_hall_id = sender.objects.filter(pk=instance.pk).values_list("hall_id", flat=True).first()


@receiver(post_save, sender=Table)
def sync_hall_capacity_on_save(sender, instance, **kwargs):
    instance.hall.recalculate_capacity()
    previous_hall_id = getattr(instance, "_previous_hall_id", None)
    if previous_hall_id and previous_hall_id != instance.hall_id:
        previous_hall = Hall.objects.filter(pk=previous_hall_id).first()
        if previous_hall:
            previous_hall.recalculate_capacity()


@receiver(post_delete, sender=Table)
def sync_hall_capacity_on_delete(sender, instance, **kwargs):
    hall = Hall.objects.filter(pk=instance.hall_id).first()
    if hall:
        hall.recalculate_capacity()
