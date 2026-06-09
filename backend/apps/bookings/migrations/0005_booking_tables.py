# Generated manually for WebTavern multi-table booking support

from django.db import migrations, models


def copy_primary_table_to_tables(apps, schema_editor):
    Booking = apps.get_model("bookings", "Booking")
    for booking in Booking.objects.exclude(table_id__isnull=True).iterator():
        booking.tables.add(booking.table_id)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0004_alter_booking_status"),
        ("tables", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="booking",
            name="tables",
            field=models.ManyToManyField(blank=True, related_name="multi_bookings", to="tables.table", verbose_name="Столы брони"),
        ),
        migrations.RunPython(copy_primary_table_to_tables, noop_reverse),
    ]
