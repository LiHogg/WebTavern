import re
from datetime import date

from rest_framework import serializers
from rest_framework.authtoken.models import Token

from apps.organizations.models import LegalEntity
from apps.venues.models import VenueManagerAssignment

from .models import User

EMAIL_ASCII_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
NAME_RE = re.compile(r"^[A-Za-zА-Яа-яЁё\-\s]+$")


def normalize_person_name(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return value

    parts = re.split(r"([\s-])", value)
    normalized: list[str] = []
    for part in parts:
        if not part or part.isspace() or part == "-":
            normalized.append(part)
            continue
        normalized.append(part[:1].upper() + part[1:].lower())
    return "".join(normalized)


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if not digits:
        raise serializers.ValidationError("Укажите номер телефона.")

    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    elif len(digits) == 10:
        digits = "7" + digits

    if len(digits) != 11 or not digits.startswith("7"):
        raise serializers.ValidationError("Введите телефон в формате +7 (999) 999-99-99.")

    return f"+7 ({digits[1:4]}) {digits[4:7]}-{digits[7:9]}-{digits[9:11]}"


class LegalEntitySerializer(serializers.ModelSerializer):
    class Meta:
        model = LegalEntity
        fields = [
            "id",
            "company_name",
            "tax_number",
            "registration_number",
            "legal_address",
            "is_active",
        ]
        read_only_fields = ["id", "is_active"]


class UserSerializer(serializers.ModelSerializer):
    legal_entities = LegalEntitySerializer(many=True, read_only=True)
    full_name = serializers.SerializerMethodField()
    client_mode_enabled = serializers.SerializerMethodField()
    primary_role = serializers.CharField(read_only=True)
    available_modes = serializers.SerializerMethodField()
    owned_venues_count = serializers.SerializerMethodField()
    managed_venues_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "phone",
            "city",
            "first_name",
            "last_name",
            "middle_name",
            "full_name",
            "date_of_birth",
            "role",
            "primary_role",
            "client_mode_enabled",
            "available_modes",
            "owned_venues_count",
            "managed_venues_count",
            "account_type",
            "legal_entities",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "role", "legal_entities", "created_at", "updated_at", "full_name", "account_type"]

    def get_full_name(self, obj: User) -> str:
        parts = [obj.last_name, obj.first_name, obj.middle_name]
        return " ".join([part for part in parts if part]).strip()

    def get_client_mode_enabled(self, obj: User) -> bool:
        return True

    def get_available_modes(self, obj: User) -> list[str]:
        modes = ['client']
        if obj.role == User.Role.OWNER or obj.venues.exists():
            modes.append('owner')
        if obj.role == User.Role.MANAGER or VenueManagerAssignment.objects.filter(manager=obj, is_active=True).exists():
            modes.append('manager')
        if obj.role == User.Role.MODERATOR:
            modes.append('moderator')
        if obj.role == User.Role.PLATFORM_ADMIN:
            modes.append('platform_admin')
        return modes

    def get_owned_venues_count(self, obj: User) -> int:
        return obj.venues.count()

    def get_managed_venues_count(self, obj: User) -> int:
        return VenueManagerAssignment.objects.filter(manager=obj, is_active=True).count()

    def _validate_name_value(self, value: str, field_label: str, required: bool = True) -> str:
        normalized = normalize_person_name(value)
        if not normalized and required:
            raise serializers.ValidationError(f"Укажите {field_label.lower()}.")
        if normalized and not NAME_RE.fullmatch(normalized):
            raise serializers.ValidationError(f"{field_label} может содержать только буквы, пробел и дефис.")
        return normalized

    def validate_email(self, value: str) -> str:
        email = value.strip().lower()
        if not EMAIL_ASCII_RE.fullmatch(email):
            raise serializers.ValidationError("Email должен быть на латинице и обязательно содержать символ @.")
        qs = User.objects.filter(email=email)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Пользователь с таким email уже зарегистрирован.")
        return email

    def validate_phone(self, value: str) -> str:
        normalized = normalize_phone(value)
        qs = User.objects.filter(phone=normalized)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Пользователь с таким телефоном уже зарегистрирован.")
        return normalized

    def validate_first_name(self, value: str) -> str:
        return self._validate_name_value(value, "Имя")

    def validate_last_name(self, value: str) -> str:
        return self._validate_name_value(value, "Фамилия")

    def validate_middle_name(self, value: str) -> str:
        if not value:
            return ""
        return self._validate_name_value(value, "Отчество", required=False)

    def validate_date_of_birth(self, value: date) -> date:
        if value > date.today():
            raise serializers.ValidationError("Дата рождения не может быть в будущем.")
        return value

    def validate_city(self, value: str) -> str:
        city = " ".join(str(value or "").strip().split())
        if len(city) > 120:
            raise serializers.ValidationError("Название города слишком длинное.")
        return city


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    company_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    tax_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    registration_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    legal_address = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            "email",
            "phone",
            "city",
            "password",
            "first_name",
            "last_name",
            "middle_name",
            "date_of_birth",
            "account_type",
            "company_name",
            "tax_number",
            "registration_number",
            "legal_address",
        ]
        extra_kwargs = {
            "phone": {"required": True},
            "date_of_birth": {"required": True},
        }

    def _validate_name_value(self, value: str, field_label: str, required: bool = True) -> str:
        normalized = normalize_person_name(value)
        if not normalized and required:
            raise serializers.ValidationError(f"Укажите {field_label.lower()}.")
        if normalized and not NAME_RE.fullmatch(normalized):
            raise serializers.ValidationError(f"{field_label} может содержать только буквы, пробел и дефис.")
        return normalized

    def validate_email(self, value: str) -> str:
        email = value.strip().lower()
        if not EMAIL_ASCII_RE.fullmatch(email):
            raise serializers.ValidationError("Email должен быть на латинице и обязательно содержать символ @.")
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError("Пользователь с таким email уже зарегистрирован.")
        return email

    def validate_phone(self, value: str) -> str:
        normalized = normalize_phone(value)
        if User.objects.filter(phone=normalized).exists():
            raise serializers.ValidationError("Пользователь с таким телефоном уже зарегистрирован.")
        return normalized

    def validate_first_name(self, value: str) -> str:
        return self._validate_name_value(value, "Имя")

    def validate_last_name(self, value: str) -> str:
        return self._validate_name_value(value, "Фамилия")

    def validate_middle_name(self, value: str) -> str:
        if not value:
            return ""
        return self._validate_name_value(value, "Отчество", required=False)

    def validate_city(self, value: str) -> str:
        city = " ".join(str(value or "").strip().split())
        if len(city) > 120:
            raise serializers.ValidationError("Название города слишком длинное.")
        return city

    def validate_password(self, value: str) -> str:
        if len(value) < 8:
            raise serializers.ValidationError("Пароль должен содержать минимум 8 символов.")
        if not re.search(r"[A-Za-z]", value):
            raise serializers.ValidationError("Пароль должен содержать хотя бы одну латинскую букву.")
        if not re.search(r"\d", value):
            raise serializers.ValidationError("Пароль должен содержать хотя бы одну цифру.")
        return value

    def validate_date_of_birth(self, value: date) -> date:
        if value > date.today():
            raise serializers.ValidationError("Дата рождения не может быть в будущем.")
        return value

    def validate_tax_number(self, value: str) -> str:
        digits = re.sub(r"\D", "", value or "")
        if value and len(digits) not in {10, 12}:
            raise serializers.ValidationError("ИНН должен содержать 10 или 12 цифр.")
        return digits

    def validate(self, attrs):
        account_type = attrs.get("account_type")
        if account_type == User.AccountType.LEGAL:
            if not attrs.get("company_name", "").strip():
                raise serializers.ValidationError({"company_name": "Укажите название организации."})
            if not attrs.get("tax_number", "").strip():
                raise serializers.ValidationError({"tax_number": "Укажите ИНН организации."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        company_name = validated_data.pop("company_name", "").strip()
        tax_number = validated_data.pop("tax_number", "").strip()
        registration_number = validated_data.pop("registration_number", "").strip()
        legal_address = validated_data.pop("legal_address", "").strip()

        user = User.objects.create_user(password=password, role=User.Role.CLIENT, **validated_data)
        Token.objects.get_or_create(user=user)

        if user.account_type == User.AccountType.LEGAL:
            LegalEntity.objects.create(
                owner=user,
                company_name=company_name,
                tax_number=tax_number,
                registration_number=registration_number,
                legal_address=legal_address,
            )

        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs.get("email", "").strip().lower()
        password = attrs.get("password")

        user = User.objects.filter(email=email).first()
        if not user:
            raise serializers.ValidationError({"email": "Пользователь с таким email не найден."})

        if not user.check_password(password):
            raise serializers.ValidationError({"password": "Неверный пароль."})

        if not user.is_active:
            raise serializers.ValidationError({"email": "Аккаунт деактивирован."})

        attrs["user"] = user
        attrs["email"] = email
        return attrs


class AuthResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    user = UserSerializer()

    @staticmethod
    def build(user: User) -> dict:
        token, _ = Token.objects.get_or_create(user=user)
        return {
            "token": token.key,
            "user": UserSerializer(user).data,
        }
