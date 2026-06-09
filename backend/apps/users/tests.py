from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import LegalEntity
from apps.users.models import User


class AuthApiTests(APITestCase):
    def test_register_individual_user(self):
        payload = {
            "email": "client.one@example.com",
            "phone": "+7 (999) 111-22-33",
            "password": "Secret123",
            "first_name": "иван",
            "last_name": "иванов",
            "middle_name": "иванович",
            "date_of_birth": "2000-01-01",
            "account_type": "individual",
        }

        response = self.client.post("/api/v1/auth/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["user"]["role"], User.Role.CLIENT)
        self.assertEqual(response.data["user"]["full_name"], "Иванов Иван Иванович")
        self.assertTrue(User.objects.filter(email="client.one@example.com").exists())

    def test_register_legal_user_creates_legal_entity(self):
        payload = {
            "email": "corp@example.com",
            "phone": "+7 (999) 222-33-44",
            "password": "Secret123",
            "first_name": "петр",
            "last_name": "петров",
            "middle_name": "",
            "date_of_birth": "1995-05-20",
            "account_type": "legal",
            "company_name": "ООО Тест",
            "tax_number": "1234567890",
            "registration_number": "1234567890123",
            "legal_address": "Москва",
        }

        response = self.client.post("/api/v1/auth/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="corp@example.com")
        self.assertTrue(LegalEntity.objects.filter(owner=user, company_name="ООО Тест").exists())

    def test_login_returns_token(self):
        user = User.objects.create_user(
            email="owner@example.com",
            password="Secret123",
            first_name="Иван",
            last_name="Иванов",
            role=User.Role.OWNER,
        )

        response = self.client.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": "Secret123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertEqual(response.data["user"]["role"], User.Role.OWNER)

    def test_login_fails_with_wrong_password(self):
        User.objects.create_user(
            email="client@example.com",
            password="Secret123",
            first_name="Иван",
            last_name="Иванов",
        )

        response = self.client.post(
            "/api/v1/auth/login/",
            {"email": "client@example.com", "password": "WrongPassword1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
