import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('venues', '0002_geo_theme_fields'),
        ('notifications', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='event_type',
            field=models.CharField(blank=True, max_length=64, verbose_name='Тип события'),
        ),
        migrations.AddField(
            model_name='notification',
            name='target_url',
            field=models.CharField(blank=True, max_length=255, verbose_name='Ссылка перехода'),
        ),
        migrations.AddField(
            model_name='notification',
            name='venue',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='venues.venue', verbose_name='Заведение'),
        ),
        migrations.AlterModelOptions(
            name='notification',
            options={'ordering': ['-created_at'], 'verbose_name': 'Уведомление', 'verbose_name_plural': 'Уведомления'},
        ),
    ]
