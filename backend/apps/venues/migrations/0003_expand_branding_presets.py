# Generated manually for WebTavern demo theme presets.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('venues', '0002_geo_theme_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='venuebranding',
            name='theme_preset',
            field=models.CharField(
                choices=[
                    ('northern_blue', 'Northern blue'),
                    ('brick_house', 'Brick house'),
                    ('sage_garden', 'Sage garden'),
                    ('night_neon', 'Night neon'),
                    ('coffee_sand', 'Coffee sand'),
                    ('berry_lounge', 'Berry lounge'),
                    ('forest_ember', 'Forest ember'),
                    ('royal_indigo', 'Royal indigo'),
                    ('sea_breeze', 'Sea breeze'),
                    ('cherry_noir', 'Cherry noir'),
                    ('amber_craft', 'Amber craft'),
                    ('mint_minimal', 'Mint minimal'),
                    ('steel_business', 'Steel business'),
                    ('sunset_orange', 'Sunset orange'),
                    ('lavender_soft', 'Lavender soft'),
                    ('graphite_gold', 'Graphite gold'),
                    ('cyber_purple', 'Cyber purple'),
                    ('nordic_frost', 'Nordic frost'),
                ],
                default='northern_blue',
                max_length=32,
                verbose_name='Готовая тема',
            ),
        ),
    ]
