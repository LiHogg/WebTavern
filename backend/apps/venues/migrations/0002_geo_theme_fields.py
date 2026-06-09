from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('venues', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='venue',
            name='country',
            field=models.CharField(default='Россия', max_length=128, verbose_name='Страна'),
        ),
        migrations.AddField(
            model_name='venue',
            name='district',
            field=models.CharField(blank=True, max_length=128, verbose_name='Район'),
        ),
        migrations.AddField(
            model_name='venue',
            name='latitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True, verbose_name='Широта'),
        ),
        migrations.AddField(
            model_name='venue',
            name='longitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True, verbose_name='Долгота'),
        ),
        migrations.AddField(
            model_name='venue',
            name='cuisine',
            field=models.CharField(blank=True, max_length=128, verbose_name='Кухня'),
        ),
        migrations.AddField(
            model_name='venue',
            name='price_category',
            field=models.CharField(choices=[('budget', 'Доступно'), ('middle', 'Средний чек'), ('high', 'Выше среднего'), ('premium', 'Премиум')], default='middle', max_length=32, verbose_name='Ценовая категория'),
        ),
        migrations.AddField(
            model_name='venue',
            name='venue_theme',
            field=models.CharField(choices=[('family', 'Семейное'), ('romantic', 'Романтика'), ('business', 'Деловое'), ('geek', 'Гик / настолки'), ('panoramic', 'Панорамное'), ('ethnic', 'Этническое'), ('art', 'Арт-пространство'), ('lounge', 'Lounge'), ('live_music', 'Живая музыка'), ('fast_casual', 'Fast casual')], default='family', max_length=32, verbose_name='Тема заведения'),
        ),
        migrations.AddField(
            model_name='venuebranding',
            name='badge_background_color',
            field=models.CharField(default='#eef2ff', max_length=32, verbose_name='Фон бейджей'),
        ),
        migrations.AddField(
            model_name='venuebranding',
            name='badge_text_color',
            field=models.CharField(default='#312e81', max_length=32, verbose_name='Текст бейджей'),
        ),
        migrations.AddField(
            model_name='venuebranding',
            name='card_background_color',
            field=models.CharField(default='#ffffff', max_length=32, verbose_name='Фон карточек'),
        ),
        migrations.AddField(
            model_name='venuebranding',
            name='card_text_color',
            field=models.CharField(default='#111827', max_length=32, verbose_name='Текст карточек'),
        ),
        migrations.AddField(
            model_name='venuebranding',
            name='cta_background_color',
            field=models.CharField(default='#111827', max_length=32, verbose_name='Фон CTA'),
        ),
        migrations.AddField(
            model_name='venuebranding',
            name='cta_text_color',
            field=models.CharField(default='#ffffff', max_length=32, verbose_name='Текст CTA'),
        ),
        migrations.AddField(
            model_name='venuebranding',
            name='theme_preset',
            field=models.CharField(choices=[('northern_blue', 'Northern blue'), ('brick_house', 'Brick house'), ('sage_garden', 'Sage garden'), ('night_neon', 'Night neon'), ('coffee_sand', 'Coffee sand'), ('berry_lounge', 'Berry lounge')], default='northern_blue', max_length=32, verbose_name='Готовая тема'),
        ),
        migrations.AddField(
            model_name='venuebranding',
            name='use_custom_palette',
            field=models.BooleanField(default=False, verbose_name='Своя палитра'),
        ),
    ]
